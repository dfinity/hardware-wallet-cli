import { LedgerIdentity } from "./ledger/identity";
import type { NeuronInfo } from "@dfinity/nns";
import { DEFAULT_TRANSACTION_FEE_E8S } from "./constants";

const AMOUNT_VERSION_PARTS = 3;
const addZeros = (nums: number[], amountZeros: number): number[] =>
  amountZeros > nums.length
    ? [...nums, ...[...Array(amountZeros - nums.length).keys()].map(() => 0)]
    : nums;

const convertToNumber = (versionStringPart: string): number => {
  if (!Number.isNaN(Number(versionStringPart))) {
    return Number(versionStringPart);
  }
  const strippedVersion = versionStringPart.split("").reduce((acc, char) => {
    if (Number.isNaN(Number(char))) {
      return acc;
    }
    return acc + char;
  }, "");
  return Number(strippedVersion);
};

/**
 * Returns true if the current version is smaller than the minVersion, false if equal or bigger.
 * Tags after patch version are ignored, e.g. 1.0.0-beta.1 is considered equal to 1.0.0.
 * 
 * Source: @dfinity/utils
 *
 * @param {Object} params
 * @param {string} params.minVersion Ex: "1.0.0"
 * @param {string} params.currentVersion Ex: "2.0.0"
 * @returns boolean
 */
export const smallerVersion = ({
  minVersion,
  currentVersion,
}: {
  minVersion: string;
  currentVersion: string;
}): boolean => {
  const minVersionStandarized = addZeros(
    minVersion.split(".").map(convertToNumber),
    AMOUNT_VERSION_PARTS
  ).join(".");
  const currentVersionStandarized = addZeros(
    currentVersion.split(".").map(convertToNumber),
    AMOUNT_VERSION_PARTS
  ).join(".");
  // Versions need to have the same number of parts to be comparable
  // Source: https://stackoverflow.com/a/65687141
  return (
    currentVersionStandarized.localeCompare(minVersionStandarized, undefined, {
      numeric: true,
      sensitivity: "base",
    }) < 0
  );
};

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
    throw new Error(`Ledger app version ${currentVersion} is too old. Please update to ${minVersion} or newer.`);
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
