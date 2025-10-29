import type { Principal } from "@dfinity/principal";
import type { ActorMethod } from "@dfinity/agent";
import type { IDL } from "@dfinity/candid";

export interface DurationSeconds {
  amount: bigint;
}
export interface TextValue {
  content: string;
}
export interface TimestampSeconds {
  amount: bigint;
}
export interface TokenAmount {
  decimals: number;
  amount: bigint;
  symbol: string;
}
export type Value =
  | { Text: TextValue }
  | { TokenAmount: TokenAmount }
  | { TimestampSeconds: TimestampSeconds }
  | { DurationSeconds: DurationSeconds };
export interface icrc21_consent_info {
  metadata: icrc21_consent_message_metadata;
  consent_message: icrc21_consent_message;
}
export type icrc21_consent_message =
  | {
      FieldsDisplayMessage: {
        fields: Array<[string, Value]>;
        intent: string;
      };
    }
  | { GenericDisplayMessage: string };
export interface icrc21_consent_message_metadata {
  utc_offset_minutes: [] | [number];
  language: string;
}
export interface icrc21_consent_message_request {
  arg: Uint8Array | number[];
  method: string;
  user_preferences: icrc21_consent_message_spec;
}
export type icrc21_consent_message_response =
  | { Ok: icrc21_consent_info }
  | { Err: icrc21_error };
export interface icrc21_consent_message_spec {
  metadata: icrc21_consent_message_metadata;
  device_spec: [] | [{ GenericDisplay: null } | { FieldsDisplay: null }];
}
export type icrc21_error =
  | {
      GenericError: { description: string; error_code: bigint };
    }
  | { InsufficientPayment: icrc21_error_info }
  | { UnsupportedCanisterCall: icrc21_error_info }
  | { ConsentMessageUnavailable: icrc21_error_info };
export interface icrc21_error_info {
  description: string;
}
export interface _SERVICE {
  greet: ActorMethod<[string], string>;
  icrc10_supported_standards: ActorMethod<
    [],
    Array<{ url: string; name: string }>
  >;
  icrc21_canister_call_consent_message: ActorMethod<
    [icrc21_consent_message_request],
    icrc21_consent_message_response
  >;
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
