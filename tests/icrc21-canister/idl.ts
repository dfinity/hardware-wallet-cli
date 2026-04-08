import { IDL } from "@icp-sdk/core/candid";

export interface _SERVICE {
  swap(from: string, to: string, amount: bigint): Promise<string>;
  icrc21_canister_call_consent_message(
    req: ConsentMessageRequest
  ): Promise<ConsentMessageResponse>;
  icrc10_supported_standards(): Promise<Array<{ name: string; url: string }>>;
}

export type ConsentMessageRequest = {
  arg: Uint8Array;
  method: string;
  user_preferences: {
    metadata: { language: string; utc_offset_minutes: [] | [number] };
    device_spec: [] | [{ GenericDisplay: null } | { FieldsDisplay: null }];
  };
};

export type ConsentMessageResponse =
  | {
      Ok: {
        metadata: {
          language: string;
          utc_offset_minutes: [] | [number];
        };
        consent_message: { GenericDisplayMessage: string } | { FieldsDisplayMessage: { intent: string; fields: Array<[string, unknown]> } };
      };
    }
  | { Err: unknown };

const ConsentMessageMetadata = IDL.Record({
  language: IDL.Text,
  utc_offset_minutes: IDL.Opt(IDL.Int16),
});

const DeviceSpec = IDL.Variant({
  GenericDisplay: IDL.Null,
  FieldsDisplay: IDL.Null,
});

const ConsentMessageSpec = IDL.Record({
  metadata: ConsentMessageMetadata,
  device_spec: IDL.Opt(DeviceSpec),
});

const ConsentMessageRequest = IDL.Record({
  arg: IDL.Vec(IDL.Nat8),
  method: IDL.Text,
  user_preferences: ConsentMessageSpec,
});

const TextValue = IDL.Record({ content: IDL.Text });
const TokenAmount = IDL.Record({
  decimals: IDL.Nat8,
  amount: IDL.Nat64,
  symbol: IDL.Text,
});
const TimestampSeconds = IDL.Record({ amount: IDL.Nat64 });
const DurationSeconds = IDL.Record({ amount: IDL.Nat64 });

const Value = IDL.Variant({
  Text: TextValue,
  TokenAmount: TokenAmount,
  TimestampSeconds: TimestampSeconds,
  DurationSeconds: DurationSeconds,
});

const ConsentMessage = IDL.Variant({
  GenericDisplayMessage: IDL.Text,
  FieldsDisplayMessage: IDL.Record({
    fields: IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    intent: IDL.Text,
  }),
});

const ConsentInfo = IDL.Record({
  metadata: ConsentMessageMetadata,
  consent_message: ConsentMessage,
});

const ErrorInfo = IDL.Record({ description: IDL.Text });

const ConsentError = IDL.Variant({
  GenericError: IDL.Record({
    description: IDL.Text,
    error_code: IDL.Nat,
  }),
  InsufficientPayment: ErrorInfo,
  UnsupportedCanisterCall: ErrorInfo,
  ConsentMessageUnavailable: ErrorInfo,
});

const ConsentMessageResponse = IDL.Variant({
  Ok: ConsentInfo,
  Err: ConsentError,
});

export const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const SupportedStandard = IDL.Record({
    name: IDL.Text,
    url: IDL.Text,
  });

  return IDL.Service({
    swap: IDL.Func([IDL.Text, IDL.Text, IDL.Nat64], [IDL.Text], []),
    icrc21_canister_call_consent_message: IDL.Func(
      [ConsentMessageRequest],
      [ConsentMessageResponse],
      []
    ),
    icrc10_supported_standards: IDL.Func(
      [],
      [IDL.Vec(SupportedStandard)],
      ["query"]
    ),
  });
};
