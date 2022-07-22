#!/usr/bin/env node

/**
 * A CLI tool for testing the Ledger hardware wallet integration.
 */
import { Command, Option, InvalidArgumentError } from "commander";
import { LedgerIdentity } from "./src/ledger/identity";
import {
  AccountIdentifier,
  LedgerCanister,
  GenesisTokenCanister,
  GovernanceCanister,
  GovernanceError,
  ICP,
  InsufficientAmountError,
  InsufficientFundsError,
} from "@dfinity/nns";
import { Principal } from "@dfinity/principal";
import type { Secp256k1PublicKey } from "src/ledger/secp256k1";
import { Agent, AnonymousIdentity, HttpAgent, Identity } from "@dfinity/agent";
import chalk from "chalk";

// Add polyfill for `window` for `TransportWebHID` checks to work.
import "node-window-polyfill/register";

// Add polyfill for `window.fetch` for agent-js to work.
// @ts-ignore (no types are available)
import fetch from "node-fetch";

global.fetch = fetch;
window.fetch = fetch;

const program = new Command();
const log = console.log;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY + 6 * SECONDS_PER_HOUR;

async function getAgent(identity: Identity): Promise<Agent> {
  const network = program.opts().network;

  // Only fetch the rootkey if the network isn't mainnet.
  const fetchRootKey = new URL(network).host == "ic0.app" ? false : true;

  const agent = new HttpAgent({
    host: program.opts().network,
    identity: identity,
  });

  if (fetchRootKey) {
    await agent.fetchRootKey();
  }

  return agent;
}

async function getLedgerIdentity(): Promise<LedgerIdentity> {
  const principalPath = tryParseInt(program.opts().principal);
  if (principalPath < 0 || principalPath > 255) {
    throw new InvalidArgumentError(
      "Principal path must be between 0 and 255 inclusive."
    );
  }
  return LedgerIdentity.create(`m/44'/223'/0'/0/${principalPath}`);
}

/**
 * Fetches the balance of the main account on the wallet.
 */
async function getBalance() {
  const identity = await getLedgerIdentity();
  const accountIdentifier = AccountIdentifier.fromPrincipal({
    principal: identity.getPrincipal(),
  });

  const ledger = LedgerCanister.create({
    agent: await getAgent(new AnonymousIdentity()),
    hardwareWallet: true,
  });

  const balance = await ledger.accountBalance({
    accountIdentifier: accountIdentifier,
  });

  ok(`Account ${accountIdentifier.toHex()} has balance ${balance.toE8s()} e8s`);
}

/**
 * Send ICP to another address.
 *
 * @param to The account identifier in hex.
 * @param amount Amount to send in e8s.
 */
async function sendICP(to: AccountIdentifier, amount: ICP) {
  const identity = await getLedgerIdentity();
  const ledger = LedgerCanister.create({
    agent: await getAgent(identity),
    hardwareWallet: true,
  });

  const blockHeight = await ledger.transfer({
    to: to,
    amount: amount,
    memo: BigInt(0),
  });

  ok(`Transaction completed at block height ${blockHeight}.`);
}

/**
 * Shows the principal and account idenifier on the terminal and on the wallet's screen.
 */
async function showInfo(showOnDevice?: boolean) {
  const identity = await getLedgerIdentity();
  const accountIdentifier = AccountIdentifier.fromPrincipal({
    principal: identity.getPrincipal(),
  });
  const publicKey = identity.getPublicKey() as Secp256k1PublicKey;

  log(chalk.bold(`Principal: `) + identity.getPrincipal());
  log(
    chalk.bold(`Address (${identity.derivePath}): `) + accountIdentifier.toHex()
  );
  log(
    chalk.bold('Public key: ') + publicKey.toHex()
  )

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
async function stakeNeuron(stake: ICP) {
  const identity = await getLedgerIdentity();
  const ledger = LedgerCanister.create({
    agent: await getAgent(identity),
  });
  const governance = GovernanceCanister.create({
    agent: await getAgent(new AnonymousIdentity()),
    hardwareWallet: true,
  });

  // Flag that an upcoming stake neuron transaction is coming to distinguish
  // it from a "send ICP" transaction on the device.
  identity.flagUpcomingStakeNeuron();

  try {
    const stakedNeuronId = await governance.stakeNeuron({
      stake: stake,
      principal: identity.getPrincipal(),
      ledgerCanister: ledger,
    });

    ok(`Staked neuron with ID: ${stakedNeuronId}`);
  } catch (error) {
    if (error instanceof InsufficientAmountError) {
      err(`Cannot stake less than ${error.minimumAmount.toE8s()} e8s`);
    } else if (error instanceof InsufficientFundsError) {
      err(`Your account has insufficient funds (${error.balance.toE8s()} e8s)`);
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
  const identity = await getLedgerIdentity();
  const governance = GovernanceCanister.create({
    agent: await getAgent(identity),
    hardwareWallet: true,
  });

  const additionalDissolveDelaySeconds =
    years * SECONDS_PER_YEAR +
    days * SECONDS_PER_DAY +
    minutes * SECONDS_PER_MINUTE +
    seconds;

  await governance.increaseDissolveDelay({
    neuronId: neuronId,
    additionalDissolveDelaySeconds: additionalDissolveDelaySeconds,
  });

  ok();
}

async function disburseNeuron(neuronId: bigint, to?: string, amount?: bigint) {
  const identity = await getLedgerIdentity();
  const governance = GovernanceCanister.create({
    agent: await getAgent(identity),
    hardwareWallet: true,
  });

  await governance.disburse({
    neuronId: BigInt(neuronId),
    toAccountId: to,
    amount: amount,
  });

  ok();
}

async function spawnNeuron(neuronId: string, controller?: Principal) {
  const identity = await getLedgerIdentity();
  const governance = GovernanceCanister.create({
    agent: await getAgent(identity),
    hardwareWallet: true,
  });

  const spawnedNeuronId = await governance.spawnNeuron({
    neuronId: BigInt(neuronId),
    newController: controller,
  });
  ok(`Spawned neuron with ID ${spawnedNeuronId}`);
}

async function startDissolving(neuronId: bigint) {
  const identity = await getLedgerIdentity();
  const governance = GovernanceCanister.create({
    agent: await getAgent(identity),
    hardwareWallet: true,
  });

  await governance.startDissolving(neuronId);

  ok();
}

async function stopDissolving(neuronId: bigint) {
  const identity = await getLedgerIdentity();
  const governance = GovernanceCanister.create({
    agent: await getAgent(identity),
    hardwareWallet: true,
  });

  await governance.stopDissolving(neuronId);

  ok();
}

async function addHotkey(neuronId: bigint, principal: Principal) {
  const identity = await getLedgerIdentity();
  const governance = GovernanceCanister.create({
    agent: await getAgent(identity),
    hardwareWallet: true,
  });

  await governance.addHotkey({
    neuronId: BigInt(neuronId),
    principal: principal,
  });

  ok();
}

async function removeHotkey(neuronId: bigint, principal: Principal) {
  const identity = await getLedgerIdentity();
  const governance = GovernanceCanister.create({
    agent: await getAgent(identity),
    hardwareWallet: true,
  });

  await governance.removeHotkey({
    neuronId: BigInt(neuronId),
    principal: principal,
  });

  ok();
}

async function listNeurons() {
  const identity = await getLedgerIdentity();
  const governance = GovernanceCanister.create({
    agent: await getAgent(identity),
    hardwareWallet: true,
  });

  // We filter neurons with no ICP, as they'll be garbage collected by the governance canister.
  const neurons = await governance.listNeurons({
    certified: true,
  });

  if (neurons.length > 0) {
    neurons.forEach((n) => {
      log(`Neuron ID: ${n.neuronId}`);
    });
  } else {
    ok("No neurons found.");
  }
}

/**
 * Fetches the balance of the main account on the wallet.
 */
async function claimNeurons() {
  const identity = await getLedgerIdentity();

  const publicKey = identity.getPublicKey() as Secp256k1PublicKey;
  const hexPubKey = publicKey.toHex();

  const governance = await GenesisTokenCanister.create({
    agent: await getAgent(identity),
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

function tryParseInt(value: string): number {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError("Not a number.");
  }
  return parsedValue;
}

function tryParseBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch (err: any) {
    throw new InvalidArgumentError(err.toString());
  }
}

function tryParsePrincipal(value: string): Principal {
  try {
    return Principal.fromText(value);
  } catch (err: any) {
    throw new InvalidArgumentError(err.toString());
  }
}

function tryParseE8s(e8s: string): ICP {
  try {
    return ICP.fromE8s(tryParseBigInt(e8s));
  } catch (err: any) {
    throw new InvalidArgumentError(err.toString());
  }
}

function tryParseAccountIdentifier(
  accountIdentifier: string
): AccountIdentifier {
  try {
    return AccountIdentifier.fromHex(accountIdentifier);
  } catch (err: any) {
    throw new InvalidArgumentError(err.toString());
  }
}

async function main() {
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
      new Command("disburse")
        .requiredOption("--neuron-id <neuron-id>", "Neuron ID", tryParseBigInt)
        .option("--to <account-identifier>")
        .option(
          "--amount <amount>",
          "Amount to disburse (empty to disburse all)",
          tryParseBigInt
        )
        .action((args) => {
          run(() => disburseNeuron(args.neuronId, args.to, args.amount));
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
        .action((args) => {
          run(() => spawnNeuron(args.neuronId, args.controller));
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
    .addCommand(new Command("list").action(() => run(listNeurons)))
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
        .description(
          "Claim the caller's GTC neurons."
        )
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
      new Option("--principal <principal>", "The derivation path to use for the principal.\n(e.g. --principal 123 will result in a derivation path of m/44'/223'/0'/0/123)\nMust be >= 0 && <= 255").default(
        0
      )
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
    .addCommand(neuron);

  await program.parseAsync(process.argv);
}

main();
