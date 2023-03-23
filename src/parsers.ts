import { InvalidArgumentError } from "commander";
import { AccountIdentifier, ICPToken, Token, TokenAmount } from "@dfinity/nns";
import { Principal } from "@dfinity/principal";
import { hexToSnsNeuronId } from "./utils";
import { SnsNeuronId } from "@dfinity/sns";
import { decodeIcrcAccount, IcrcAccount } from "@dfinity/ledger";

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
  } catch (err: any) {
    throw new InvalidArgumentError(err.toString());
  }
}

export function tryParsePrincipal(value: string): Principal {
  try {
    return Principal.fromText(value);
  } catch (err: any) {
    throw new InvalidArgumentError(err.toString());
  }
}

export function tryParseSnsNeuronId(value: string): SnsNeuronId {
  try {
    return hexToSnsNeuronId(value);
  } catch (err: any) {
    throw new InvalidArgumentError(err.toString());
  }
}

export function tryParseE8s(e8s: string): TokenAmount {
  try {
    return TokenAmount.fromE8s({
      amount: tryParseBigInt(e8s),
      token: ICPToken,
    });
  } catch (err: any) {
    throw new InvalidArgumentError(err.toString());
  }
}

export function tryParseAccountIdentifier(
  accountIdentifier: string
): AccountIdentifier {
  try {
    return AccountIdentifier.fromHex(accountIdentifier);
  } catch (err: any) {
    throw new InvalidArgumentError(err.toString());
  }
}

export function tryParseIcrcAccount(accountIdentifier: string): IcrcAccount {
  try {
    return decodeIcrcAccount(accountIdentifier);
  } catch (err: any) {
    throw new InvalidArgumentError(err.toString());
  }
}
