import { LedgerIdentity } from "./ledger/identity";
import { arrayOfNumberToUint8Array, smallerVersion } from "@dfinity/utils";
import type { NeuronInfo } from "@dfinity/nns";
import { DEFAULT_TRANSACTION_FEE_E8S } from "./constants";
import { InvalidArgumentError, program } from "commander";
import { Agent, HttpAgent, Identity } from "@dfinity/agent";
import { SnsNeuronId } from "@dfinity/sns";

/**
 * Raises an error if the current version is smaller than the minVersion, does nothing if equal or bigger.
 * Tags after patch version are ignored, e.g. 1.0.0-beta.1 is considered equal to 1.0.0.
 *
 * @param {Object} params
 * @param {string} params.version Ex: "1.0.0"
 * @param {string} params.identity
 * @returns boolean
 */
export const assertLedgerVersion = async ({
  identity,
  minVersion,
}: {
  identity: LedgerIdentity;
  minVersion: string;
}): Promise<void> => {
  // Ignore when identity not LedgerIdentity
  if (!(identity instanceof LedgerIdentity)) {
    return;
  }

  const { major, minor, patch } = await identity.getVersion();
  const currentVersion = `${major}.${minor}.${patch}`;
  if (smallerVersion({ currentVersion, minVersion })) {
    throw new Error(
      `Ledger app version ${currentVersion} is too old. Please update to ${minVersion} or newer.`
    );
  }
};

/**
 * Returns true if the current version is smaller than the minVersion, false if equal or bigger.
 * Tags after patch version are ignored, e.g. 1.0.0-beta.1 is considered equal to 1.0.0.
 *
 * @param {Object} params
 * @param {string} params.version Ex: "1.0.0"
 * @param {string} params.identity
 * @returns boolean
 */
export const isCurrentVersionSmallerThan = async ({
  identity,
  version,
}: {
  identity: LedgerIdentity;
  version: string;
}): Promise<boolean> => {
  // False if identity not LedgerIdentity
  if (!(identity instanceof LedgerIdentity)) {
    return false;
  }

  const { major, minor, patch } = await identity.getVersion();
  const currentVersion = `${major}.${minor}.${patch}`;
  return smallerVersion({ currentVersion, minVersion: version });
};

export const hasValidStake = (neuron: NeuronInfo): boolean =>
  // Ignore if we can't validate the stake
  neuron.fullNeuron !== undefined
    ? neuron.fullNeuron.cachedNeuronStake +
        neuron.fullNeuron.maturityE8sEquivalent >
      BigInt(DEFAULT_TRANSACTION_FEE_E8S)
    : false;

export async function getLedgerIdentity(
  principalPath: number
): Promise<LedgerIdentity> {
  if (principalPath < 0 || principalPath > 255) {
    throw new InvalidArgumentError(
      "Principal path must be between 0 and 255 inclusive."
    );
  }
  return LedgerIdentity.create(`m/44'/223'/0'/0/${principalPath}`);
}

export async function getAgent(
  identity: Identity,
  network: string
): Promise<Agent> {
  // Only fetch the rootkey if the network isn't mainnet.
  const fetchRootKey = new URL(network).host == "ic0.app" ? false : true;

  const agent = new HttpAgent({
    host: network,
    identity: identity,
  });

  if (fetchRootKey) {
    await agent.fetchRootKey();
  }

  return agent;
}

// Convert a byte array to a hex string
export const bytesToHexString = (bytes: number[]): string =>
  bytes.reduce(
    (str, byte) => `${str}${byte.toString(16).padStart(2, "0")}`,
    ""
  );

/**
 * Convert a subaccount to a hex string.
 * SnsNeuron id is a subaccount.
 *
 * @param {Uint8Array} subaccount
 * @returns {string} hex string
 */
export const subaccountToHexString = (subaccount: Uint8Array): string =>
  bytesToHexString(Array.from(subaccount));

// TODO: Move to @dfinity/utils
// Convert a hex string to a byte array
// Source: https://stackoverflow.com/a/34356351
export const hexStringToBytes = (hexString: string): number[] => {
  const bytes: number[] = [];
  // Loop through each pair of hex digits
  for (let c = 0; c < hexString.length; c += 2) {
    const hexDigit = hexString.substring(c, c + 2);
    // Parse a base 16
    const byte = parseInt(hexDigit, 16);
    bytes.push(byte);
  }
  return bytes;
};

export const hexToSnsNeuronId = (hex: string): SnsNeuronId => ({
  id: arrayOfNumberToUint8Array(hexStringToBytes(hex)),
});

export const nowInBigIntNanoSeconds = (): bigint =>
  BigInt(Date.now()) * BigInt(1e6);
