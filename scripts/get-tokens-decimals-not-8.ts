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
import { createAgent, fromNullable, isNullish } from "@dfinity/utils";
import { writeFileSync } from "node:fs";

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

type TokenInfo = {
  ledgerCanisterId: string;
  indexCanisterId: string;
  tokenSymbol: string;
  decimals?: bigint;
};

const buildOrchestratorInfo = async (
  orchestratorId: Principal
): Promise<TokenInfo[]> => {
  const { managed_canisters } = await orchestratorInfo({ orchestratorId });

  // eslint-disable-next-line local-rules/prefer-object-params -- This is a destructuring assignment
  const mapManagedCanisters = ({
    ledger,
    index,
    ckerc20_token_symbol,
  }: ManagedCanisters): TokenInfo | undefined => {
    const ledgerCanister = fromNullable(ledger);
    const indexCanister = fromNullable(index);

    // Skip tokens without Ledger or Index (by definition, this can happen).
    if (isNullish(ledgerCanister) || isNullish(indexCanister)) {
      return undefined;
    }

    const { canister_id: ledgerCanisterId } =
      "Created" in ledgerCanister
        ? ledgerCanister.Created
        : ledgerCanister.Installed;
    const { canister_id: indexCanisterId } =
      "Created" in indexCanister
        ? indexCanister.Created
        : indexCanister.Installed;

    return {
      ledgerCanisterId: ledgerCanisterId.toText(),
      indexCanisterId: indexCanisterId.toText(),
      tokenSymbol: ckerc20_token_symbol,
    };
  };

  const assertToken = (token: TokenInfo | undefined): token is TokenInfo =>
    token !== undefined;

  return managed_canisters.map(mapManagedCanisters).filter(assertToken);
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

const findCkErc20 = async () => {
  const [staging, production] = await Promise.all(
    [ORCHESTRATOR_STAGING_ID, ORCHESTRATOR_PRODUCTION_ID].map(
      buildOrchestratorInfo
    )
  );

  const ckETH: TokenInfo = {
    ledgerCanisterId: "ss2fx-dyaaa-aaaar-qacoq-cai",
    indexCanisterId: "s3zol-vqaaa-aaaar-qacpa-cai",
    tokenSymbol: "ckETH",
  };

  const tokens = [ckETH, ...production, ...staging];

  const tokensWithDecimals = await Promise.all(tokens.map(addTokenDecimals));
  const tokensNot8Decimals = tokensWithDecimals.filter(
    (token) => token.decimals !== 8n
  );

  writeFileSync(
    "tokens.json",
    JSON.stringify(tokensNot8Decimals, (_key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (value instanceof Principal) {
        return value.toText();
      }
      return value;
    })
  );
};

const build = async () => {
  try {
    await findCkErc20();
  } catch (err) {
    console.error(err);
  }
};

build();
