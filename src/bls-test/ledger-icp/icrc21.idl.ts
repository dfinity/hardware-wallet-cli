import { IDL } from "@dfinity/candid";

const icrc21_consent_message_metadata = IDL.Record({
  utc_offset_minutes: IDL.Opt(IDL.Int16),
  language: IDL.Text,
});

const icrc21_consent_message_spec = IDL.Record({
  metadata: icrc21_consent_message_metadata,
  device_spec: IDL.Opt(
    IDL.Variant({
      GenericDisplay: IDL.Null,
      LineDisplay: IDL.Record({
        characters_per_line: IDL.Nat16,
        lines_per_page: IDL.Nat16,
      }),
    })
  ),
});

export const icrc21_consent_message_request = IDL.Record({
  arg: IDL.Vec(IDL.Nat8),
  method: IDL.Text,
  user_preferences: icrc21_consent_message_spec,
});

const icrc21_consent_message = IDL.Variant({
  LineDisplayMessage: IDL.Record({
    pages: IDL.Vec(IDL.Record({ lines: IDL.Vec(IDL.Text) })),
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
