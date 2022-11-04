import { LedgerIdentity } from "./ledger/identity";
import {smallerVersion} from "@dfinity/utils";

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