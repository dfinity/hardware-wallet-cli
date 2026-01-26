import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface DurationSeconds {
  'amount': bigint;
}
export interface TextValue {
  'content': string;
}
export interface TimestampSeconds {
  'amount': bigint;
}
export interface TokenAmount {
  'decimals': number;
  'amount': bigint;
  'symbol': string;
}
export type Value =
  { 'Text': TextValue } |
  { 'TokenAmount': TokenAmount } |
  { 'TimestampSeconds': TimestampSeconds } |
  { 'DurationSeconds': DurationSeconds };
export interface icrc21_consent_info {
  'metadata': icrc21_consent_message_metadata;
  'consent_message': icrc21_consent_message;
}
export type icrc21_consent_message =
  {
    'FieldsDisplayMessage': {
      'fields': Array<[string, Value]>;
      'intent': string;
    }
  } |
  { 'GenericDisplayMessage': string };
export interface icrc21_consent_message_metadata {
  'utc_offset_minutes': [] | [number];
  'language': string;
}
export interface icrc21_consent_message_request {
  'arg': Uint8Array | number[];
  'method': string;
  'user_preferences': icrc21_consent_message_spec;
}
export type icrc21_consent_message_response =
  { 'Ok': icrc21_consent_info } |
  { 'Err': icrc21_error };
export interface icrc21_consent_message_spec {
  'metadata': icrc21_consent_message_metadata;
  'device_spec': [] | [
    { 'GenericDisplay': null } |
      { 'FieldsDisplay': null }
  ];
}
export type icrc21_error =
  {
    'GenericError': { 'description': string; 'error_code': bigint }
  } |
  { 'InsufficientPayment': icrc21_error_info } |
  { 'UnsupportedCanisterCall': icrc21_error_info } |
  { 'ConsentMessageUnavailable': icrc21_error_info };
export interface icrc21_error_info {
  'description': string;
}
export interface _SERVICE {
  'icrc10_supported_standards': ActorMethod<
    [],
    Array<{ 'url': string; 'name': string }>
  >;
  'icrc21_canister_call_consent_message': ActorMethod<
    [icrc21_consent_message_request],
    icrc21_consent_message_response
  >;
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];

export const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const icrc21_consent_message_metadata = IDL.Record({
    'utc_offset_minutes': IDL.Opt(IDL.Int16),
    'language': IDL.Text,
  });
  const icrc21_consent_message_spec = IDL.Record({
    'metadata': icrc21_consent_message_metadata,
    'device_spec': IDL.Opt(
      IDL.Variant({ 'GenericDisplay': IDL.Null, 'FieldsDisplay': IDL.Null })
    ),
  });
  const icrc21_consent_message_request = IDL.Record({
    'arg': IDL.Vec(IDL.Nat8),
    'method': IDL.Text,
    'user_preferences': icrc21_consent_message_spec,
  });
  const TextValue = IDL.Record({ 'content': IDL.Text });
  const TokenAmount = IDL.Record({
    'decimals': IDL.Nat8,
    'amount': IDL.Nat64,
    'symbol': IDL.Text,
  });
  const TimestampSeconds = IDL.Record({ 'amount': IDL.Nat64 });
  const DurationSeconds = IDL.Record({ 'amount': IDL.Nat64 });
  const Value = IDL.Variant({
    'Text': TextValue,
    'TokenAmount': TokenAmount,
    'TimestampSeconds': TimestampSeconds,
    'DurationSeconds': DurationSeconds,
  });
  const icrc21_consent_message = IDL.Variant({
    'FieldsDisplayMessage': IDL.Record({
      'fields': IDL.Vec(IDL.Tuple(IDL.Text, Value)),
      'intent': IDL.Text,
    }),
    'GenericDisplayMessage': IDL.Text,
  });
  const icrc21_consent_info = IDL.Record({
    'metadata': icrc21_consent_message_metadata,
    'consent_message': icrc21_consent_message,
  });
  const icrc21_error_info = IDL.Record({ 'description': IDL.Text });
  const icrc21_error = IDL.Variant({
    'GenericError': IDL.Record({
      'description': IDL.Text,
      'error_code': IDL.Nat,
    }),
    'InsufficientPayment': icrc21_error_info,
    'UnsupportedCanisterCall': icrc21_error_info,
    'ConsentMessageUnavailable': icrc21_error_info,
  });
  const icrc21_consent_message_response = IDL.Variant({
    'Ok': icrc21_consent_info,
    'Err': icrc21_error,
  });
  return IDL.Service({
    'icrc10_supported_standards': IDL.Func(
      [],
      [IDL.Vec(IDL.Record({ 'url': IDL.Text, 'name': IDL.Text }))],
      ['query'],
    ),
    'icrc21_canister_call_consent_message': IDL.Func(
      [icrc21_consent_message_request],
      [icrc21_consent_message_response],
      [],
    ),
  });
};

export const init = ({ IDL }: { IDL: typeof IDL }): IDL.Type[] => {
  return [];
};
