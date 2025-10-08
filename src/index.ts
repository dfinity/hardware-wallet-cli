#!/usr/bin/env node

/**
 * A CLI tool for testing the Ledger hardware wallet integration.
 */
import { Command, Option } from "commander";
import {
  GenesisTokenCanister,
  GovernanceCanister,
  GovernanceError,
  InsufficientAmountError,
  Vote,
  Topic,
} from "@dfinity/nns";
import {
  tryParseAccountIdentifier,
  tryParseBigInt,
  tryParseBool,
  tryParseE8s,
  tryParseIcrcAccount,
  tryParseInt,
  tryParseListBigint,
  tryParsePercentage,
  tryParsePrincipal,
  tryParseSnsNeuronId,
} from "./parsers";
import { Principal } from "@dfinity/principal";
import {
  assertLedgerVersion,
  hasValidStake,
  isCurrentVersionSmallerThan,
  getLedgerIdentity,
  getAgent,
  subaccountToHexString,
  nowInBigIntNanoSeconds,
  isCurrentVersionSmallerThanFullCandidParser,
} from "./utils";
import { CANDID_PARSER_VERSION, HOTKEY_PERMISSIONS } from "./constants";
import { AnonymousIdentity, Identity } from "@dfinity/agent";
import { SnsGovernanceCanister, SnsNeuronId } from "@dfinity/sns";
import { TokenAmountV2, fromNullable, toNullable } from "@dfinity/utils";
import {
  encodeIcrcAccount,
  IcrcAccount,
  IcrcLedgerCanister,
} from "@dfinity/ledger-icrc";
import chalk from "chalk";
import {
  AccountIdentifier,
  LedgerCanister,
  InsufficientFundsError,
} from "@dfinity/ledger-icp";

// Add polyfill for `window` for `TransportWebHID` checks to work.
import "node-window-polyfill/register";

// @ts-ignore (no types are available)
import fetch from "node-fetch";
import { Secp256k1PublicKey } from "./ledger/secp256k1";

(global as any).fetch = fetch;
// Add polyfill for `window.fetch` for agent-js to work.
(window as any).fetch = fetch;

const program = new Command();
const log = console.log;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY + 6 * SECONDS_PER_HOUR;

// TODO: Export from nns-js and use it here.
const MAINNET_LEDGER_CANISTER_ID = Principal.fromText(
  "ryjl3-tyaaa-aaaaa-aaaba-cai"
);

async function getIdentity() {
  const principalPath = tryParseInt(program.opts().principal);
  return getLedgerIdentity(principalPath);
}

async function getCurrentAgent(identity: Identity) {
  const network: string = program.opts().network;
  return getAgent(identity, network);
}

/**
 * SNS Functionality
 */

type SnsCallParams = {
  canisterId: Principal;
};

async function snsListNeurons(canisterId: Principal) {
  const identity = await getIdentity();
  const snsGovernance = SnsGovernanceCanister.create({
    agent: await getCurrentAgent(new AnonymousIdentity()),
    canisterId,
  });
  const neurons = await snsGovernance.listNeurons({
    certified: true,
    principal: identity.getPrincipal(),
  });

  if (neurons.length > 0) {
    neurons.forEach((n) => {
      const neuronId = fromNullable(n.id);
      if (neuronId !== undefined) {
        log(
          `Neuron ID: ${subaccountToHexString(Uint8Array.from(neuronId.id))}`
        );
      } else {
        log("Neuron ID: N/A");
      }
    });
  } else {
    ok("No neurons found.");
  }
}

async function snsAddHotkey({
  neuronId,
  principal,
  canisterId,
}: { neuronId: SnsNeuronId; principal: Principal } & SnsCallParams) {
  const identity = await getIdentity();
  const snsGovernance = SnsGovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    canisterId,
  });

  await snsGovernance.addNeuronPermissions({
    neuronId,
    principal: principal,
    permissions: HOTKEY_PERMISSIONS,
  });

  ok();
}

async function snsRemoveHotkey({
  neuronId,
  principal,
  canisterId,
}: { neuronId: SnsNeuronId; principal: Principal } & SnsCallParams) {
  const identity = await getIdentity();
  const snsGovernance = SnsGovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    canisterId,
  });

  await snsGovernance.removeNeuronPermissions({
    neuronId,
    principal: principal,
    permissions: HOTKEY_PERMISSIONS,
  });

  ok();
}

async function snsStartDissolving({
  neuronId,
  canisterId,
}: { neuronId: SnsNeuronId } & SnsCallParams) {
  const identity = await getIdentity();
  const snsGovernance = SnsGovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    canisterId,
  });

  await snsGovernance.startDissolving(neuronId);

  ok();
}

async function snsStopDissolving({
  neuronId,
  canisterId,
}: { neuronId: SnsNeuronId } & SnsCallParams) {
  const identity = await getIdentity();
  const snsGovernance = SnsGovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    canisterId,
  });

  await snsGovernance.stopDissolving(neuronId);

  ok();
}

async function snsDisburse({
  neuronId,
  canisterId,
  amount,
  to,
}: {
  neuronId: SnsNeuronId;
  amount?: TokenAmountV2;
  to?: IcrcAccount;
} & SnsCallParams) {
  const identity = await getIdentity();
  const snsGovernance = SnsGovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    canisterId,
  });

  await snsGovernance.disburse({
    neuronId,
    amount: amount?.toE8s(),
    toAccount: to,
  });

  ok();
}

async function snsSetDissolveDelay({
  neuronId,
  canisterId,
  years,
  days,
  minutes,
  seconds,
}: {
  neuronId: SnsNeuronId;
  years: number;
  days: number;
  minutes: number;
  seconds: number;
} & SnsCallParams) {
  const identity = await getIdentity();
  const snsGovernance = SnsGovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    canisterId,
  });

  const dissolveDelaySeconds =
    years * SECONDS_PER_YEAR +
    days * SECONDS_PER_DAY +
    minutes * SECONDS_PER_MINUTE +
    seconds;

  await snsGovernance.setDissolveTimestamp({
    neuronId,
    dissolveTimestampSeconds: BigInt(
      Math.floor(Date.now() / 1000) + dissolveDelaySeconds
    ),
  });

  ok();
}

async function snsStakeMaturity({
  neuronId,
  canisterId,
  percentageToStake,
}: {
  neuronId: SnsNeuronId;
  percentageToStake: number;
} & SnsCallParams) {
  const identity = await getIdentity();
  const snsGovernance = SnsGovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    canisterId,
  });

  await snsGovernance.stakeMaturity({ neuronId, percentageToStake });

  ok();
}

/**
 * ICRC Functionality
 */

/**
 * Fetches the balance of the main ICP account on the wallet.
 */
async function icrcGetBalance(
  canisterId: Principal = MAINNET_LEDGER_CANISTER_ID
) {
  const identity = await getIdentity();
  const account: IcrcAccount = { owner: identity.getPrincipal() };

  const ledger = IcrcLedgerCanister.create({
    agent: await getCurrentAgent(new AnonymousIdentity()),
    canisterId: canisterId ?? MAINNET_LEDGER_CANISTER_ID,
  });

  const balance = await ledger.balance(account);

  ok(`Account ${encodeIcrcAccount(account)} has balance ${balance} e8s`);
}

// TODO: Add support for subaccounts
async function icrcSendTokens({
  canisterId = MAINNET_LEDGER_CANISTER_ID,
  amount,
  to,
}: {
  amount: TokenAmountV2;
  to: IcrcAccount;
  canisterId: Principal;
}) {
  const identity = await getIdentity();
  const ledger = IcrcLedgerCanister.create({
    agent: await getCurrentAgent(identity),
    canisterId,
  });
  const anonymousLedger = IcrcLedgerCanister.create({
    agent: await getCurrentAgent(new AnonymousIdentity()),
    canisterId,
  });
  const fee = await anonymousLedger.transactionFee({});

  await ledger.transfer({
    to: {
      owner: to.owner,
      subaccount: toNullable(to.subaccount),
    },
    amount: amount.toE8s(),
    fee,
    created_at_time: nowInBigIntNanoSeconds(),
  });

  ok();
}

async function icrcApprove({
  canisterId = MAINNET_LEDGER_CANISTER_ID,
  amount,
  spender,
  expiresAt,
  expectedAllowanceInMilliSeconds: expectedAllowanceInMilliSeconds,
}: {
  amount: TokenAmountV2;
  spender: IcrcAccount;
  canisterId: Principal;
  expiresAt?: bigint;
  expectedAllowanceInMilliSeconds?: bigint;
}) {
  const identity = await getIdentity();
  const ledger = IcrcLedgerCanister.create({
    agent: await getCurrentAgent(identity),
    canisterId,
  });
  const anonymousLedger = IcrcLedgerCanister.create({
    agent: await getCurrentAgent(new AnonymousIdentity()),
    canisterId,
  });
  const fee = await anonymousLedger.transactionFee({});
  const expectedAtNanoSeconds =
    expectedAllowanceInMilliSeconds !== undefined
      ? expectedAllowanceInMilliSeconds * BigInt(1_000_000)
      : undefined;

  await ledger.approve({
    spender: {
      owner: spender.owner,
      subaccount: toNullable(spender.subaccount),
    },
    amount: amount.toE8s(),
    fee,
    created_at_time: nowInBigIntNanoSeconds(),
    expires_at: expiresAt,
    expected_allowance: expectedAtNanoSeconds,
  });

  ok();
}

/**
 * NNS Functionality
 */

/**
 * Fetches the balance of the main ICP account on the wallet.
 */
async function getBalance() {
  const identity = await getIdentity();
  const accountIdentifier = AccountIdentifier.fromPrincipal({
    principal: identity.getPrincipal(),
  });

  const ledger = LedgerCanister.create({
    agent: await getCurrentAgent(new AnonymousIdentity()),
  });

  const balance = await ledger.accountBalance({
    accountIdentifier: accountIdentifier,
  });

  ok(`Account ${accountIdentifier.toHex()} has balance ${balance} e8s`);
}

/**
 * Send ICP to another address.
 *
 * @param to The account identifier in hex.
 * @param amount Amount to send in e8s.
 */
async function sendICP(to: AccountIdentifier, amount: TokenAmountV2) {
  const identity = await getIdentity();
  const ledger = LedgerCanister.create({
    agent: await getCurrentAgent(identity),
  });

  const blockHeight = await ledger.transfer({
    to: to,
    amount: amount.toE8s(),
    memo: BigInt(0),
  });

  ok(`Transaction completed at block height ${blockHeight}.`);
}

/**
 * Shows the principal and account idenifier on the terminal and on the wallet's screen.
 */
async function showInfo(showOnDevice?: boolean) {
  const identity = await getIdentity();
  const accountIdentifier = AccountIdentifier.fromPrincipal({
    principal: identity.getPrincipal(),
  });
  const publicKey = identity.getPublicKey();

  log(chalk.bold(`Principal: `) + identity.getPrincipal());
  log(
    chalk.bold(`Address (${identity.derivePath}): `) + accountIdentifier.toHex()
  );
  log(chalk.bold("Public key: ") + publicKey.toDer());

  if (showOnDevice) {
    log("Displaying the principal and the address on the device...");
    await identity.showAddressAndPubKeyOnDevice();
  }
}

/**
 * Stakes a new neuron.
 *
 * @param amount Amount to stake in e8s.
 */
async function stakeNeuron(stake: TokenAmountV2) {
  const identity = await getIdentity();
  const ledger = LedgerCanister.create({
    agent: await getCurrentAgent(identity),
  });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(new AnonymousIdentity()),
    hardwareWallet: await isCurrentVersionSmallerThanFullCandidParser(identity),
  });

  // Flag that an upcoming stake neuron transaction is coming to distinguish
  // it from a "send ICP" transaction on the device.
  identity.flagUpcomingStakeNeuron();

  try {
    const stakedNeuronId = await governance.stakeNeuron({
      stake: stake.toE8s(),
      principal: identity.getPrincipal(),
      ledgerCanister: ledger,
    });

    ok(`Staked neuron with ID: ${stakedNeuronId}`);
  } catch (error: unknown) {
    if (error instanceof InsufficientAmountError) {
      err(`Cannot stake less than ${error.minimumAmount} e8s`);
    } else if (error instanceof InsufficientFundsError) {
      err(
        `Your account has insufficient funds (${
          (error as InsufficientFundsError).balance
        } e8s)`
      );
    } else {
      console.log(error);
    }
  }
}

async function increaseDissolveDelay(
  neuronId: bigint,
  years: number,
  days: number,
  minutes: number,
  seconds: number
) {
  const identity = await getIdentity();
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  const additionalDissolveDelaySeconds =
    years * SECONDS_PER_YEAR +
    days * SECONDS_PER_DAY +
    minutes * SECONDS_PER_MINUTE +
    seconds;

  await governance.increaseDissolveDelay({
    neuronId,
    additionalDissolveDelaySeconds: additionalDissolveDelaySeconds,
  });

  ok();
}

async function setDissolveDelay(
  neuronId: bigint,
  years: number,
  days: number,
  minutes: number,
  seconds: number
) {
  const identity = await getIdentity();
  await assertLedgerVersion({ identity, minVersion: CANDID_PARSER_VERSION });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  const dissolveDelaySeconds =
    years * SECONDS_PER_YEAR +
    days * SECONDS_PER_DAY +
    minutes * SECONDS_PER_MINUTE +
    seconds;

  await governance.setDissolveDelay({
    neuronId,
    dissolveDelaySeconds: Math.floor(Date.now() / 1000) + dissolveDelaySeconds,
  });

  ok();
}

async function disburseNeuron(neuronId: bigint, to?: string, amount?: bigint) {
  const identity = await getIdentity();
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    hardwareWallet: await isCurrentVersionSmallerThanFullCandidParser(identity),
  });

  await governance.disburse({
    neuronId: BigInt(neuronId),
    toAccountId: to,
    amount: amount,
  });

  ok();
}

async function splitNeuron(neuronId: bigint, amount: bigint) {
  const identity = await getIdentity();
  await assertLedgerVersion({ identity, minVersion: CANDID_PARSER_VERSION });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.splitNeuron({
    neuronId: BigInt(neuronId),
    amount,
  });

  ok();
}

async function spawnNeuron(
  neuronId: string,
  controller?: Principal,
  percentage?: number
) {
  const identity = await getIdentity();
  // Percentage is only supported with version CANDID_PARSER_VERSION and above
  if (percentage !== undefined) {
    await assertLedgerVersion({ identity, minVersion: CANDID_PARSER_VERSION });
  }
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    // `hardwareWallet: true` uses Protobuf and doesn't support percentage
    hardwareWallet:
      percentage === undefined &&
      (await isCurrentVersionSmallerThan({
        identity,
        version: CANDID_PARSER_VERSION,
      })),
  });

  const spawnedNeuronId = await governance.spawnNeuron({
    neuronId: BigInt(neuronId),
    newController: controller,
    percentageToSpawn: percentage,
  });
  ok(`Spawned neuron with ID ${spawnedNeuronId}`);
}

async function stakeMaturity(neuronId: bigint, percentage?: number) {
  const identity = await getIdentity();
  await assertLedgerVersion({ identity, minVersion: CANDID_PARSER_VERSION });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.stakeMaturity({
    neuronId: BigInt(neuronId),
    percentageToStake: percentage,
  });

  ok();
}

async function enableAutoStake(neuronId: bigint, autoStake: boolean) {
  const identity = await getIdentity();
  await assertLedgerVersion({ identity, minVersion: CANDID_PARSER_VERSION });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.autoStakeMaturity({
    neuronId: BigInt(neuronId),
    autoStake,
  });

  ok();
}

async function startDissolving(neuronId: bigint) {
  const identity = await getIdentity();
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.startDissolving(neuronId);

  ok();
}

async function stopDissolving(neuronId: bigint) {
  const identity = await getIdentity();
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.stopDissolving(neuronId);

  ok();
}

async function joinCommunityFund(neuronId: bigint) {
  const identity = await getIdentity();
  // Even though joining is supported for earler version
  // we don't want a user to be able to join but not leave.
  await assertLedgerVersion({ identity, minVersion: CANDID_PARSER_VERSION });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    hardwareWallet: await isCurrentVersionSmallerThanFullCandidParser(identity),
  });

  await governance.joinCommunityFund(neuronId);

  ok();
}

async function leaveCommunityFund(neuronId: bigint) {
  const identity = await getIdentity();
  await assertLedgerVersion({ identity, minVersion: CANDID_PARSER_VERSION });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    hardwareWallet: await isCurrentVersionSmallerThanFullCandidParser(identity),
  });

  await governance.leaveCommunityFund(neuronId);

  ok();
}

async function addHotkey(neuronId: bigint, principal: Principal) {
  const identity = await getIdentity();
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    hardwareWallet: await isCurrentVersionSmallerThanFullCandidParser(identity),
  });

  await governance.addHotkey({
    neuronId: BigInt(neuronId),
    principal: principal,
  });

  ok();
}

async function removeHotkey(neuronId: bigint, principal: Principal) {
  const identity = await getIdentity();
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    hardwareWallet: await isCurrentVersionSmallerThanFullCandidParser(identity),
  });

  await governance.removeHotkey({
    neuronId: BigInt(neuronId),
    principal: principal,
  });

  ok();
}

async function listNeurons(showZeroStake: boolean = false) {
  const identity = await getIdentity();
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
    hardwareWallet: await isCurrentVersionSmallerThan({
      identity,
      version: "2.0.0",
    }),
  });

  // We filter neurons with no ICP, as they'll be garbage collected by the governance canister.
  const neurons = await governance.listNeurons({
    certified: true,
  });

  if (neurons.length > 0) {
    neurons
      .filter((n) => showZeroStake || hasValidStake(n))
      .forEach((n) => {
        log(`Neuron ID: ${n.neuronId}`);
      });
  } else {
    ok("No neurons found.");
  }
}

async function mergeNeurons(sourceNeuronId: bigint, targetNeuronId: bigint) {
  const identity = await getIdentity();
  await assertLedgerVersion({ identity, minVersion: CANDID_PARSER_VERSION });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.mergeNeurons({
    targetNeuronId,
    sourceNeuronId,
  });

  ok();
}

async function refreshVotingPower(neuronId: bigint) {
  const identity = await getIdentity();
  await assertLedgerVersion({ identity, minVersion: CANDID_PARSER_VERSION });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.refreshVotingPower({
    neuronId,
  });

  ok();
}

async function disburseNnsMaturity(
  neuronId: bigint,
  percentage: number,
  toAccountIdentifier: string
) {
  console.log("in da disburse nns maturity func");
  console.log("toAccountIdentifier: ", toAccountIdentifier);
  console.log("neuronId: ", neuronId);
  console.log("percentage: ", percentage);
  const identity = await getIdentity();
  await assertLedgerVersion({ identity, minVersion: "4.2.0" });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.disburseMaturity({
    neuronId,
    percentageToDisburse: percentage,
    toAccountIdentifier,
  });

  ok();
}

async function registerVote(neuronId: bigint, proposalId: bigint, vote: Vote) {
  if (!Object.values(Vote).includes(vote)) {
    throw new Error(
      `Invalid vote value. Valid values are: ${Object.values(Vote).join(", ")}`
    );
  }
  const identity = await getIdentity();
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.registerVote({
    proposalId,
    neuronId,
    vote,
  });

  ok();
}

async function setFollowees(
  neuronId: bigint,
  topic: Topic,
  followees: bigint[]
) {
  if (!Object.values(Topic).includes(topic)) {
    throw new Error(
      `Invalid topic value. Valid values are: ${Object.values(Topic).join(
        ", "
      )}`
    );
  }
  const identity = await getIdentity();
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.setFollowees({
    neuronId,
    topic,
    followees,
  });

  ok();
}

async function setNodeProviderAccount(account: AccountIdentifier) {
  const identity = await getIdentity();
  await assertLedgerVersion({ identity, minVersion: CANDID_PARSER_VERSION });
  const governance = GovernanceCanister.create({
    agent: await getCurrentAgent(identity),
  });

  await governance.setNodeProviderAccount(account.toHex());

  ok();
}

/**
 * Fetches the balance of the main account on the wallet.
 */
async function claimNeurons() {
  const identity = await getIdentity();

  const publicKey = identity.getPublicKey() as Secp256k1PublicKey;
  const hexPubKey = publicKey.toHex();

  const governance = await GenesisTokenCanister.create({
    agent: await getCurrentAgent(identity),
  });

  const claimedNeuronIds = await governance.claimNeurons({
    hexPubKey,
  });

  ok(`Successfully claimed the following neurons: ${claimedNeuronIds}`);
}

/**
 * Runs a function with a try/catch block.
 */
async function run(f: () => void) {
  try {
    await f();
  } catch (error: any) {
    err(error);
  }
}

function ok(message?: string) {
  if (message) {
    log(`${chalk.green(chalk.bold("OK"))}: ${message}`);
  } else {
    log(`${chalk.green(chalk.bold("OK"))}`);
  }
}

function err(error: any) {
  const message =
    error instanceof GovernanceError
      ? error.detail.error_message
      : error instanceof Error
      ? error.message
      : error;
  log(`${chalk.bold(chalk.red("Error:"))} ${message}`);
}

async function main() {
  const icrc = new Command("icrc")
    .description("Commands for managing ICRC ledger.")
    .addCommand(
      new Command("balance")
        .description("Get the balance of the main account on the ICRC wallet.")
        .option(
          "--canister-id <canister-id>",
          "Canister ID (defaults to ICP Ledger)",
          tryParsePrincipal
        )
        .action((args) => run(() => icrcGetBalance(args.canisterId)))
    )
    .addCommand(
      new Command("transfer")
        .description("Send tokens from the ICRC wallet to another account.")
        .option(
          "--canister-id <canister-id>",
          "Canister ID (defaults to ICP Ledger)",
          tryParsePrincipal
        )
        .requiredOption(
          "--to <account-identifier>",
          "ICRC Account",
          tryParseIcrcAccount
        )
        .requiredOption(
          "--amount <amount>",
          "Amount to transfer in e8s",
          tryParseE8s
        )
        .action(({ to, amount, canisterId }) => {
          run(() => icrcSendTokens({ to, amount, canisterId }));
        })
    )
    .addCommand(
      new Command("approve")
        .description("Approve tokens for transfer from the ICRC wallet.")
        .option(
          "--canister-id <canister-id>",
          "Canister ID (defaults to ICP Ledger)",
          tryParsePrincipal
        )
        .requiredOption(
          "--spender <account-identifier>",
          "ICRC Account",
          tryParseIcrcAccount
        )
        .requiredOption(
          "--amount <amount>",
          "Amount to transfer in e8s",
          tryParseE8s
        )
        .option(
          "--expires-at <timestamp>",
          "Expiration timestamp (in milliseconds)",
          tryParseBigInt
        )
        .option(
          "--expected-allowance <amount>",
          "Expected current allowance in decimals",
          tryParseBigInt
        )
        .action(
          ({ spender, amount, canisterId, expiresAt, expectedAllowance }) => {
            run(() =>
              icrcApprove({
                spender,
                amount,
                canisterId,
                expiresAt,
                expectedAllowanceInMilliSeconds: expectedAllowance,
              })
            );
          }
        )
    );

  const snsNeuron = new Command("neuron")
    .description("Commands for managing sns neurons.")
    .addCommand(
      new Command("list")
        .requiredOption(
          "--canister-id <canister-id>",
          "Canister ID",
          tryParsePrincipal
        )
        .action((args) => run(() => snsListNeurons(args.canisterId)))
    )
    .addCommand(
      new Command("add-hotkey")
        .requiredOption(
          "--canister-id <canister-id>",
          "Canister ID",
          tryParsePrincipal
        )
        .requiredOption(
          "--principal <principal>",
          "Principal",
          tryParsePrincipal
        )
        .requiredOption(
          "--neuron-id <neuron-id>",
          "Neuron ID",
          tryParseSnsNeuronId
        )
        .action(({ canisterId, principal, neuronId }) =>
          run(() =>
            snsAddHotkey({
              canisterId,
              principal,
              neuronId,
            })
          )
        )
    )
    .addCommand(
      new Command("remove-hotkey")
        .requiredOption(
          "--canister-id <canister-id>",
          "Canister ID",
          tryParsePrincipal
        )
        .requiredOption(
          "--principal <principal>",
          "Principal",
          tryParsePrincipal
        )
        .requiredOption(
          "--neuron-id <neuron-id>",
          "Neuron ID",
          tryParseSnsNeuronId
        )
        .action(({ canisterId, principal, neuronId }) =>
          run(() =>
            snsRemoveHotkey({
              canisterId,
              principal,
              neuronId,
            })
          )
        )
    )
    .addCommand(
      new Command("start-dissolving")
        .requiredOption(
          "--canister-id <canister-id>",
          "Canister ID",
          tryParsePrincipal
        )
        .requiredOption(
          "--neuron-id <neuron-id>",
          "Neuron ID",
          tryParseSnsNeuronId
        )
        .action(({ canisterId, neuronId }) =>
          run(() =>
            snsStartDissolving({
              canisterId,
              neuronId,
            })
          )
        )
    )
    .addCommand(
      new Command("stop-dissolving")
        .requiredOption(
          "--canister-id <canister-id>",
          "Canister ID",
          tryParsePrincipal
        )
        .requiredOption(
          "--neuron-id <neuron-id>",
          "Neuron ID",
          tryParseSnsNeuronId
        )
        .action(({ canisterId, neuronId }) =>
          run(() =>
            snsStopDissolving({
              canisterId,
              neuronId,
            })
          )
        )
    )
    .addCommand(
      new Command("stake-maturity")
        .requiredOption(
          "--canister-id <canister-id>",
          "Canister ID",
          tryParsePrincipal
        )
        .requiredOption(
          "--neuron-id <neuron-id>",
          "Neuron ID",
          tryParseSnsNeuronId
        )
        .option(
          "--percentage <percentage>",
          "Percentage of the maturity to stake (defaults to 100)",
          tryParsePercentage
        )
        .action(({ canisterId, neuronId, percentage }) =>
          run(() =>
            snsStakeMaturity({
              canisterId,
              neuronId,
              percentageToStake: percentage,
            })
          )
        )
    )
    .addCommand(
      new Command("disburse")
        .requiredOption(
          "--canister-id <canister-id>",
          "Canister ID",
          tryParsePrincipal
        )
        .requiredOption(
          "--neuron-id <neuron-id>",
          "Neuron ID",
          tryParseSnsNeuronId
        )
        .option(
          "--to <account-identifier>",
          "ICRC Account (defaults to controller's main account)",
          tryParseIcrcAccount
        )
        .option(
          "--amount <amount>",
          "Amount to disburse in e8s (empty to disburse all)",
          tryParseE8s
        )
        .action(({ neuronId, to, amount, canisterId }) => {
          run(() => snsDisburse({ neuronId, to, amount, canisterId }));
        })
    )
    .addCommand(
      new Command("set-dissolve-delay")
        .requiredOption(
          "--canister-id <canister-id>",
          "Canister ID",
          tryParsePrincipal
        )
        .requiredOption(
          "--neuron-id <neuron-id>",
          "Neuron ID",
          tryParseSnsNeuronId
        )
        .option("--years <years>", "Number of years", tryParseInt)
        .option("--days <days>", "Number of days", tryParseInt)
        .option("--minutes <minutes>", "Number of minutes", tryParseInt)
        .option("--seconds <seconds>", "Number of seconds", tryParseInt)
        .action((args) =>
          run(() =>
            snsSetDissolveDelay({
              canisterId: args.canisterId,
              neuronId: args.neuronId,
              years: args.years || 0,
              days: args.days || 0,
              minutes: args.minutes || 0,
              seconds: args.seconds || 0,
            })
          )
        )
    );

  const sns = new Command("sns")
    .description("Commands for managing SNS.")
    .addCommand(snsNeuron);

  const neuron = new Command("neuron")
    .description("Commands for managing neurons.")
    .showSuggestionAfterError()
    .addCommand(
      new Command("stake")
        .requiredOption(
          "--amount <amount>",
          "Amount to stake in e8s.",
          tryParseE8s
        )
        .action((args) => run(() => stakeNeuron(args.amount)))
    )
    .addCommand(
      new Command("increase-dissolve-delay")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .option("--years <years>", "Number of years", tryParseInt)
        .option("--days <days>", "Number of days", tryParseInt)
        .option("--minutes <minutes>", "Number of minutes", tryParseInt)
        .option("--seconds <seconds>", "Number of seconds", tryParseInt)
        .action((args) =>
          run(() =>
            increaseDissolveDelay(
              args.neuronId,
              args.years || 0,
              args.days || 0,
              args.minutes || 0,
              args.seconds || 0
            )
          )
        )
    )
    .addCommand(
      new Command("set-dissolve-delay")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .option("--years <years>", "Number of years", tryParseInt)
        .option("--days <days>", "Number of days", tryParseInt)
        .option("--minutes <minutes>", "Number of minutes", tryParseInt)
        .option("--seconds <seconds>", "Number of seconds", tryParseInt)
        .action((args) =>
          run(() =>
            setDissolveDelay(
              args.neuronId,
              args.years || 0,
              args.days || 0,
              args.minutes || 0,
              args.seconds || 0
            )
          )
        )
    )
    .addCommand(
      new Command("disburse")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .option("--to <account-identifier>")
        .option(
          "--amount <amount>",
          "Amount to disburse in e8s (empty to disburse all)",
          tryParseBigInt
        )
        .action((args) => {
          run(() => disburseNeuron(args.neuronId, args.to, args.amount));
        })
    )
    .addCommand(
      new Command("split")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .option(
          "--amount <amount>",
          "Amount split into a new neuron in e8s",
          tryParseBigInt
        )
        .action((args) => {
          run(() => splitNeuron(args.neuronId, args.amount));
        })
    )
    .addCommand(
      new Command("spawn")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .option(
          "--controller <new-controller>",
          "Controller",
          tryParsePrincipal
        )
        .option(
          "--percentage-to-spawn <percentage>",
          "Percentage of maturity to spawn",
          tryParseInt
        )
        .action((args) => {
          run(() =>
            spawnNeuron(args.neuronId, args.controller, args.percentageToSpawn)
          );
        })
    )
    .addCommand(
      new Command("stake-maturity")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .option(
          "--percentage-to-stake <percentage>",
          "Percentage of maturity to stake",
          tryParseInt
        )
        .action((args) => {
          run(() => stakeMaturity(args.neuronId, args.percentageToStake));
        })
    )
    .addCommand(
      new Command("enable-auto-stake-maturity")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .requiredOption(
          "--enable-auto-stake <enable>",
          "Should auto stake maturity be enabled",
          tryParseBool
        )
        .action((args) => {
          run(() => enableAutoStake(args.neuronId, args.enableAutoStake));
        })
    )
    .addCommand(
      new Command("start-dissolving")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .action((args) => {
          run(() => startDissolving(args.neuronId));
        })
    )
    .addCommand(
      new Command("stop-dissolving")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .action((args) => {
          run(() => stopDissolving(args.neuronId));
        })
    )
    .addCommand(
      new Command("join-community-fund")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .action((args) => {
          run(() => joinCommunityFund(args.neuronId));
        })
    )
    .addCommand(
      new Command("leave-community-fund")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .action((args) => {
          run(() => leaveCommunityFund(args.neuronId));
        })
    )
    .addCommand(
      new Command("list")
        .option(
          "--show-zero-stake",
          "Show neurons with zero stake and maturity"
        )
        .action((args) => run(() => listNeurons(args.showZeroStake)))
    )
    .addCommand(
      new Command("add-hotkey")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .requiredOption(
          "--principal <principal>",
          "Principal",
          tryParsePrincipal
        )
        .action((args) => run(() => addHotkey(args.neuronId, args.principal)))
    )
    .addCommand(
      new Command("merge-neurons")
        .requiredOption(
          "--source-neuron-id <source-neuron-id>",
          "Neuron ID",
          tryParseBigInt
        )
        .requiredOption(
          "--target-neuron-id <target-neuron-id>",
          "Neuron ID",
          tryParseBigInt
        )
        .action((args) =>
          run(() => mergeNeurons(args.sourceNeuronId, args.targetNeuronId))
        )
    )
    .addCommand(
      new Command("refresh-voting-power")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .action((args) => run(() => refreshVotingPower(args.neuronId)))
    )
    .addCommand(
      new Command("disburse-maturity")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .requiredOption(
          "--percentage <percentage>",
          "Percentage to disburse",
          tryParseInt
        )
        .option(
          "--to <to-account-identifier>",
          "Account identifier to disburse to."
        )
        .action((args) =>
          run(() =>
            disburseNnsMaturity(args.neuronId, args.percentage, args.to)
          )
        )
    )
    .addCommand(
      new Command("register-vote")
        .description("Vote on a specific proposal.")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .requiredOption(
          "--proposal-id <proposal-id>",
          "Proposal ID",
          tryParseBigInt
        )
        .requiredOption(
          "--vote <vote>",
          "Vote (1 for YES, 2 for NO)",
          tryParseInt
        )
        .action((args) =>
          run(() => registerVote(args.neuronId, args.proposalId, args.vote))
        )
    )
    .addCommand(
      new Command("set-followees")
        .description(
          "Set followees of a neuron in a specific topic. This will overwrite the existing followees for that topic."
        )
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .requiredOption("--topic-id <topic>", "Topic ID", tryParseInt)
        .requiredOption(
          "--followees <followees>",
          "Comma-separated Neuron IDs",
          tryParseListBigint
        )
        .action((args) =>
          run(() => setFollowees(args.neuronId, args.topicId, args.followees))
        )
    )
    .addCommand(
      new Command("remove-hotkey")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .requiredOption(
          "--principal <principal>",
          "Principal",
          tryParsePrincipal
        )
        .action((args) =>
          run(() => removeHotkey(args.neuronId, args.principal))
        )
    )
    .addCommand(
      new Command("claim")
        .description("Claim the caller's GTC neurons.")
        .action((args) => run(() => claimNeurons()))
    );

  const icp = new Command("icp")
    .description("Commands for managing ICP.")
    .showSuggestionAfterError()
    .addCommand(
      new Command("balance")
        .description("Fetch current balance.")
        .action(() => {
          run(getBalance);
        })
    )
    .addCommand(
      new Command("transfer")
        .requiredOption(
          "--to <account-identifier>",
          "Account identifier to transfer to.",
          tryParseAccountIdentifier
        )
        .requiredOption(
          "--amount <amount>",
          "Amount to transfer in e8s.",
          tryParseE8s
        )
        .action((args) => run(() => sendICP(args.to, args.amount)))
    );

  const nodeProvider = new Command("node-provider")
    .description("Commands for managing node providers.")
    .showSuggestionAfterError()
    .addCommand(
      new Command("set-node-provider-account")
        .requiredOption(
          "--account <account>",
          "Account ID",
          tryParseAccountIdentifier
        )
        .action((args) => run(() => setNodeProviderAccount(args.account)))
    );
  program
    .description("A CLI for the Ledger hardware wallet.")
    .enablePositionalOptions()
    .showSuggestionAfterError()
    .addOption(
      new Option("--network <network>", "The IC network to talk to.")
        .default("https://ic0.app")
        .env("IC_NETWORK")
    )
    .addOption(
      new Option(
        "--principal <principal>",
        "The derivation path to use for the principal.\n(e.g. --principal 123 will result in a derivation path of m/44'/223'/0'/0/123)\nMust be >= 0 && <= 255"
      ).default(0)
    )
    .addCommand(
      new Command("info")
        .option("-n --no-show-on-device")
        .description("Show the wallet's principal, address, and balance.")
        .action((args) => {
          run(() => showInfo(args.showOnDevice));
        })
    )
    .addCommand(icp)
    .addCommand(neuron)
    .addCommand(sns)
    .addCommand(icrc)
    .addCommand(nodeProvider);

  await program.parseAsync(process.argv);
}

main();
