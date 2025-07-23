import { IDL } from "@dfinity/candid";
const icrc21_consent_message_metadata = IDL.Record({
  utc_offset_minutes: IDL.Opt(IDL.Int16),
  language: IDL.Text,
});
const icrc21_consent_message_spec = IDL.Record({
  metadata: icrc21_consent_message_metadata,
  device_spec: IDL.Opt(
    IDL.Variant({ GenericDisplay: IDL.Null, FieldsDisplay: IDL.Null })
  ),
});
export const icrc21_consent_message_request = IDL.Record({
  arg: IDL.Vec(IDL.Nat8),
  method: IDL.Text,
  user_preferences: icrc21_consent_message_spec,
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
export const icrc21_consent_message = IDL.Variant({
  FieldsDisplayMessage: IDL.Record({
    fields: IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    intent: IDL.Text,
  }),
  GenericDisplayMessage: IDL.Text,
});
const icrc21_consent_info = IDL.Record({
  metadata: icrc21_consent_message_metadata,
  consent_message: icrc21_consent_message,
});
const icrc21_error_info = IDL.Record({ description: IDL.Text });
const icrc21_error = IDL.Variant({
  GenericError: IDL.Record({
    description: IDL.Text,
    error_code: IDL.Nat,
  }),
  InsufficientPayment: icrc21_error_info,
  UnsupportedCanisterCall: icrc21_error_info,
  ConsentMessageUnavailable: icrc21_error_info,
});
export const icrc21_consent_message_response = IDL.Variant({
  Ok: icrc21_consent_info,
  Err: icrc21_error,
});
export const greetFunction = IDL.Func([IDL.Text], [IDL.Text], ["query"]);
export const icrc10SupportedStandardsFunction = IDL.Func(
  [],
  [IDL.Vec(IDL.Record({ url: IDL.Text, name: IDL.Text }))],
  ["query"]
);
export const icrc21CanisterCallConsentMessageFunction = IDL.Func(
  [icrc21_consent_message_request],
  [icrc21_consent_message_response],
  []
);

export const idlFactory = ({ IDL }) => {
  const icrc21_consent_message_metadata = IDL.Record({
    utc_offset_minutes: IDL.Opt(IDL.Int16),
    language: IDL.Text,
  });
  const icrc21_consent_message_spec = IDL.Record({
    metadata: icrc21_consent_message_metadata,
    device_spec: IDL.Opt(
      IDL.Variant({ GenericDisplay: IDL.Null, FieldsDisplay: IDL.Null })
    ),
  });
  const icrc21_consent_message_request = IDL.Record({
    arg: IDL.Vec(IDL.Nat8),
    method: IDL.Text,
    user_preferences: icrc21_consent_message_spec,
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
  const icrc21_consent_message = IDL.Variant({
    FieldsDisplayMessage: IDL.Record({
      fields: IDL.Vec(IDL.Tuple(IDL.Text, Value)),
      intent: IDL.Text,
    }),
    GenericDisplayMessage: IDL.Text,
  });
  const icrc21_consent_info = IDL.Record({
    metadata: icrc21_consent_message_metadata,
    consent_message: icrc21_consent_message,
  });
  const icrc21_error_info = IDL.Record({ description: IDL.Text });
  const icrc21_error = IDL.Variant({
    GenericError: IDL.Record({
      description: IDL.Text,
      error_code: IDL.Nat,
    }),
    InsufficientPayment: icrc21_error_info,
    UnsupportedCanisterCall: icrc21_error_info,
    ConsentMessageUnavailable: icrc21_error_info,
  });
  const icrc21_consent_message_response = IDL.Variant({
    Ok: icrc21_consent_info,
    Err: icrc21_error,
  });
  return IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    icrc10_supported_standards: IDL.Func(
      [],
      [IDL.Vec(IDL.Record({ url: IDL.Text, name: IDL.Text }))],
      ["query"]
    ),
    icrc21_canister_call_consent_message: IDL.Func(
      [icrc21_consent_message_request],
      [icrc21_consent_message_response],
      []
    ),
  });
};
export const init = ({ IDL }) => {
  return [];
};
