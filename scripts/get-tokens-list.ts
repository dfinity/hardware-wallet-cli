// This script is used to create a list of tokens for Zondax (developers of Ledger IC App)
// They use this list to set the decimals for each token.
import { AnonymousIdentity, HttpAgent } from "@dfinity/agent";
import {
  CkETHOrchestratorCanister,
  ManagedCanisters,
  OrchestratorInfo,
} from "@dfinity/cketh";
import { IcrcLedgerCanister } from "@dfinity/ledger-icrc";
import { Principal } from "@dfinity/principal";
import { SnsSwapLifecycle } from "@dfinity/sns";
import {
  createAgent,
  fromNullable,
  isNullish,
  jsonReplacer,
  nonNullish,
} from "@dfinity/utils";
import { writeFileSync } from "node:fs";

type TokenInfo = {
  ledgerCanisterId: string;
  tokenSymbol?: string;
  decimals?: bigint;
};

const AGGREGATOR_PAGE_SIZE = 10;
const SNS_AGGREGATOR_CANISTER_URL =
  "https://3r4gx-wqaaa-aaaaq-aaaia-cai.icp0.io";
const AGGREGATOR_CANISTER_VERSION = "v1";
const aggergatorPageUrl = (page: number) => `/sns/list/page/${page}/slow.json`;

type CanisterIds = {
  root_canister_id: string;
  governance_canister_id: string;
  index_canister_id: string;
  swap_canister_id: string;
  ledger_canister_id: string;
};
type MetadadaValue = { Nat: [number] } | { Text: string };
type MetadataEntry = [string, MetadadaValue];
type Lifecycle = {
  decentralization_sale_open_timestamp_seconds: number;
  lifecycle: number;
  decentralization_swap_termination_timestamp_seconds: number | null;
};

type PartialSnsData = {
  canister_ids: CanisterIds;
  icrc1_metadata: Array<MetadataEntry>;
  lifecycle: Lifecycle;
};

const querySnsAggregator = async (page = 0): Promise<PartialSnsData[]> => {
  let response: Response;
  try {
    response = await fetch(
      `${SNS_AGGREGATOR_CANISTER_URL}/${AGGREGATOR_CANISTER_VERSION}${aggergatorPageUrl(
        page
      )}`
    );
  } catch (e) {
    // If the error is after the first page, is because there are no more pages it fails
    if (page > 0) {
      console.error(
        `Error loading SNS project page ${page} from aggregator canister`
      );
      return [];
    }
    throw e;
  }
  if (!response.ok) {
    // If the error is after the first page, is because there are no more pages it fails
    if (page > 0) {
      return [];
    }
    console.error(response);
    throw new Error("Error loading SNS projects from aggregator canister");
  }
  const data: PartialSnsData[] = await response.json();
  if (data.length === AGGREGATOR_PAGE_SIZE) {
    const nextPageData = await querySnsAggregator(page + 1);
    return [...data, ...nextPageData];
  }
  return data;
};

const decimals = (medatata: Array<MetadataEntry>): bigint | undefined => {
  const decimalsEntry = medatata.find(([key]) => key === "icrc1:decimals");
  return "Nat" in decimalsEntry![1]
    ? BigInt(decimalsEntry![1].Nat[0])
    : undefined;
};

const tokenSymbol = (medatata: Array<MetadataEntry>): string | undefined => {
  const decimalsEntry = medatata.find(([key]) => key === "icrc1:symbol");
  return "Text" in decimalsEntry![1] ? decimalsEntry![1].Text : undefined;
};

const convertToToken = (snsData: PartialSnsData): TokenInfo => ({
  ledgerCanisterId: snsData.canister_ids.ledger_canister_id,
  tokenSymbol: tokenSymbol(snsData.icrc1_metadata),
  decimals: decimals(snsData.icrc1_metadata),
});

const getSnsTokens = async (): Promise<TokenInfo[]> => {
  try {
    const allSnses: PartialSnsData[] = await querySnsAggregator();
    return allSnses
      .filter(
        ({ lifecycle }) => lifecycle.lifecycle === SnsSwapLifecycle.Committed
      )
      .map(convertToToken);
  } catch (err) {
    console.error("Error fetching sns data", err);
    throw err;
  }
};

const getAgent = (): Promise<HttpAgent> =>
  createAgent({
    identity: new AnonymousIdentity(),
    host: "https://icp-api.io",
  });

const orchestratorInfo = async ({
  orchestratorId: canisterId,
}: {
  orchestratorId: Principal;
}): Promise<OrchestratorInfo> => {
  const agent = await getAgent();
  const { getOrchestratorInfo } = CkETHOrchestratorCanister.create({
    agent,
    canisterId,
  });

  return getOrchestratorInfo({ certified: true });
};

const buildOrchestratorInfo = async (
  orchestratorId: Principal
): Promise<TokenInfo[]> => {
  const { managed_canisters } = await orchestratorInfo({ orchestratorId });

  // eslint-disable-next-line local-rules/prefer-object-params -- This is a destructuring assignment
  const mapManagedCanisters = ({
    ledger,
    ckerc20_token_symbol,
  }: ManagedCanisters): TokenInfo | undefined => {
    const ledgerCanister = fromNullable(ledger);

    // Skip tokens without Ledger or Index (by definition, this can happen).
    if (isNullish(ledgerCanister)) {
      return undefined;
    }

    const { canister_id: ledgerCanisterId } =
      "Created" in ledgerCanister
        ? ledgerCanister.Created
        : ledgerCanister.Installed;

    return {
      ledgerCanisterId: ledgerCanisterId.toText(),
      tokenSymbol: ckerc20_token_symbol,
    };
  };

  return managed_canisters.map(mapManagedCanisters).filter(nonNullish);
};

const addTokenDecimals = async (token: TokenInfo): Promise<TokenInfo> => {
  const { metadata } = IcrcLedgerCanister.create({
    agent: await getAgent(),
    canisterId: Principal.fromText(token.ledgerCanisterId),
  });

  const data = await metadata({ certified: true });

  const decimalsEntry = data.find((item) => item[0] === "icrc1:decimals");
  const decimals = "Nat" in decimalsEntry![1] ? decimalsEntry![1].Nat : 0n;

  return {
    ...token,
    decimals,
  };
};

const ORCHESTRATOR_STAGING_ID = Principal.fromText(
  "2s5qh-7aaaa-aaaar-qadya-cai"
);
const ORCHESTRATOR_PRODUCTION_ID = Principal.fromText(
  "vxkom-oyaaa-aaaar-qafda-cai"
);

const getAllTokens = async () => {
  const [staging, production] = await Promise.all(
    [ORCHESTRATOR_STAGING_ID, ORCHESTRATOR_PRODUCTION_ID].map(
      buildOrchestratorInfo
    )
  );

  const ckETH: TokenInfo = {
    ledgerCanisterId: "ss2fx-dyaaa-aaaar-qacoq-cai",
    tokenSymbol: "ckETH",
  };
  const ICP: TokenInfo = {
    ledgerCanisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    tokenSymbol: "ICP",
  };

  const snsTokens = await getSnsTokens();

  const tokens = [ICP, ckETH, ...production, ...staging, ...snsTokens];

  const tokensWithDecimals = await Promise.all(tokens.map(addTokenDecimals));

  writeFileSync(
    "tokens.json",
    JSON.stringify(tokensWithDecimals, jsonReplacer)
  );
};

const build = async () => {
  try {
    await getAllTokens();
  } catch (err) {
    console.error(err);
  }
};

build();
