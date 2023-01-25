import { LedgerIdentity } from "./ledger/identity";
import {smallerVersion} from "@dfinity/utils";
import { NeuronInfo } from "@dfinity/nns";
import { DEFAULT_TRANSACTION_FEE_E8S } from "./constants";

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