import { InvalidArgumentError } from "commander";
import { AccountIdentifier } from "@icp-sdk/canisters/ledger/icp";
import { Principal } from "@icp-sdk/core/principal";
import { hexToSnsNeuronId } from "./utils";
import { SnsGovernanceDid } from "@icp-sdk/canisters/sns";
import { decodeIcrcAccount, IcrcAccount } from "@icp-sdk/canisters/ledger/icrc";
import { TokenAmountV2, ICPToken } from "@dfinity/utils";

export function tryParseInt(value: string): number {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError("Not a number.");
  }
  return parsedValue;
}

export function tryParsePercentage(value: string): number {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError("Not a number.");
  }
  if (parsedValue < 0 || parsedValue > 100) {
    throw new InvalidArgumentError(
      "Not a percentage. Try a number between 0 and 100."
    );
  }
  return parsedValue;
}

export function tryParseBool(value: string): boolean {
  const validValues = ["true", "false"];
  if (!validValues.includes(value)) {
    throw new InvalidArgumentError("Not a boolean. Try 'true' or 'false'.");
  }
  return value !== "false";
}

export function tryParseBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch (err: unknown) {
    throw new InvalidArgumentError(
      (err as Error)?.toString() ?? "Not a bigint."
    );
  }
}

export function tryParsePrincipal(value: string): Principal {
  try {
    return Principal.fromText(value);
  } catch (err: unknown) {
    throw new InvalidArgumentError(
      (err as Error)?.toString() ?? "Not a principal."
    );
  }
}

export function tryParseSnsNeuronId(value: string): SnsGovernanceDid.NeuronId {
  try {
    return hexToSnsNeuronId(value);
  } catch (err: unknown) {
    throw new InvalidArgumentError(
      (err as Error)?.toString() ?? "Not an SNS neuron id."
    );
  }
}

export function tryParseE8s(e8s: string): TokenAmountV2 {
  try {
    return TokenAmountV2.fromUlps({
      amount: tryParseBigInt(e8s),
      token: ICPToken,
    });
  } catch (err: unknown) {
    throw new InvalidArgumentError(
      (err as Error)?.toString() ?? "Not an E8s amount."
    );
  }
}

export function tryParseAccountIdentifier(
  accountIdentifier: string
): AccountIdentifier {
  try {
    return AccountIdentifier.fromHex(accountIdentifier);
  } catch (err: unknown) {
    throw new InvalidArgumentError(
      (err as Error)?.toString() ?? "Not an account id."
    );
  }
}

export function tryParseIcrcAccount(accountIdentifier: string): IcrcAccount {
  try {
    return decodeIcrcAccount(accountIdentifier);
  } catch (err: unknown) {
    throw new InvalidArgumentError(
      (err as Error)?.toString() ?? "Not an ICRC account."
    );
  }
}

export function tryParseListBigint(nums: string): bigint[] {
  try {
    return nums.split(",").map(tryParseBigInt);
  } catch (err: unknown) {
    throw new InvalidArgumentError(
      (err as Error)?.toString() ?? "Not a list of bigints."
    );
  }
}
