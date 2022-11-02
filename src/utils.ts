import { LedgerIdentity } from "./ledger/identity";

// TODO: Use @dfinity/utils
const AMOUNT_VERSION_PARTS = 3;
const addZeros = (nums: number[], amountZeros: number): number[] =>
  amountZeros > nums.length
    ? [...nums, ...[...Array(amountZeros - nums.length).keys()].map(() => 0)]
    : nums;
/**
 * Returns true if the current version is smaller than the minVersion, false if equal or bigger.
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
    minVersion.split(".").map(Number),
    AMOUNT_VERSION_PARTS
  ).join(".");
  const currentVersionStandarized = addZeros(
    currentVersion.split(".").map(Number),
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