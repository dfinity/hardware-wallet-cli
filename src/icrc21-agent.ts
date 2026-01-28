import { Principal } from "@icp-sdk/core/principal";
import type {
  Agent,
  CallOptions,
  Identity,
  SubmitResponse,
  CallRequest,
  v4ResponseBody,
} from "@icp-sdk/core/agent";
import {
  HttpAgent,
  Certificate,
  SubmitRequestType,
  requestIdOf,
  Cbor,
  AnonymousIdentity,
} from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { bytesToHexString } from "./utils";
import { lookupResultToBuffer } from "@icp-sdk/core/agent";
import { LedgerIdentity } from "./ledger/identity";

// Define ICRC-21 consent message types
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

const textEncoder = new TextEncoder();

/**
 * Icrc21Agent implements the Agent interface with ICRC-21 consent message support.
 * Internally creates two HttpAgents:
 * - anonymous_agent: Uses AnonymousIdentity to fetch consent messages
 * - signing_agent: Uses the provided identity to sign and submit requests
 */
export class Icrc21Agent implements Agent {
  private readonly anonymousAgent: HttpAgent;
  private readonly signingAgent: HttpAgent;
  private readonly identity: LedgerIdentity;
  readonly host: string;

  constructor(identity: LedgerIdentity, network: string) {
    // Store identity for BLS signing
    this.identity = identity;
    this.host = network;

    // Create anonymous agent for fetching consent messages
    this.anonymousAgent = HttpAgent.createSync({
      identity: new AnonymousIdentity(),
      host: network,
    });

    // Create signing agent for submitting signed requests
    this.signingAgent = HttpAgent.createSync({
      identity,
      host: network,
    });
  }

  // ========== Required Properties ==========

  get rootKey(): Uint8Array | null {
    return this.anonymousAgent.rootKey;
  }

  // ========== Required Methods ==========

  async getPrincipal(): Promise<Principal> {
    return this.signingAgent.getPrincipal();
  }

  /**
   * Implements the ICRC-21 consent flow:
   * 1. Get consent message from certificate
   * 2. Build and sign the actual canister call request
   * 3. Submit the signed request
   * 4. Return SubmitResponse
   */
  async call(
    canisterIdArg: Principal | string,
    fields: CallOptions
  ): Promise<SubmitResponse> {
    const canisterId = Principal.from(canisterIdArg);

    // 1. Get consent message from certificate
    const { consentRequest, certificateBytes } = await this.getConsentMessage(canisterId, fields);

    // 2. Build the actual canister call request
    const senderPrincipal = await this.identity.getPrincipal();

    const canisterCallContent: CallRequest = {
      request_type: SubmitRequestType.Call,
      canister_id: canisterId,
      method_name: fields.methodName,
      arg: fields.arg,
      sender: senderPrincipal,
      ingress_expiry: consentRequest.ingress_expiry,
      nonce: consentRequest.nonce,
    };

    // Calculate requestId for the actual call
    const actualRequestId = requestIdOf(canisterCallContent);

    // 3. Get BLS signature
    const { signature } = await this.signRequest(consentRequest, canisterCallContent, certificateBytes);

    // 4. Submit the signed request
    const submitResponse = await this.submitSignedRequest(canisterId, canisterCallContent, signature);

    return {
      requestId: actualRequestId,
      response: submitResponse.response,
      requestDetails: canisterCallContent,
    };
  }

  private async getConsentMessage(
    canisterId: Principal,
    fields: CallOptions
  ): Promise<{ consentRequest: CallRequest; certificateBytes: Uint8Array }> {
    const consentMessageRequest = IDL.encode(
      [icrc21_consent_message_request],
      [
        {
          arg: Array.from(fields.arg),
          method: fields.methodName,
          user_preferences: {
            metadata: {
              language: "en",
              utc_offset_minutes: [],
            },
            device_spec: [{ FieldsDisplay: null }],
          },
        },
      ]
    );

    const consentMessageSubmitResponse = await this.anonymousAgent.call(canisterId, {
      methodName: "icrc21_canister_call_consent_message",
      arg: consentMessageRequest,
      effectiveCanisterId: canisterId,
    });

    if (!consentMessageSubmitResponse.response.body) {
      throw new Error("No response body from consent message call");
    }

    const rootKey = this.anonymousAgent.rootKey;
    if (!rootKey) {
      throw new Error("No root key - agent needs to fetch root key first");
    }

    const certificateBytes = new Uint8Array(
      (consentMessageSubmitResponse.response.body as v4ResponseBody).certificate
    );

    const consentRequest = consentMessageSubmitResponse.requestDetails;

    return { consentRequest, certificateBytes };
  }

  private async signRequest(
    consentRequest: CallRequest,
    canisterCallContent: CallRequest,
    certificateBytes: Uint8Array
  ): Promise<{ signature: Uint8Array }> {
    const consentRequestHex = bytesToHexString(Cbor.encode({ content: consentRequest }));
    const canisterCallHex = bytesToHexString(Cbor.encode({ content: canisterCallContent }));
    const certificateHex = bytesToHexString(certificateBytes);

    const signature = await this.identity.signBls(
      consentRequestHex,
      canisterCallHex,
      certificateHex
    );

    return { signature };
  }

  private async submitSignedRequest(
    canisterId: Principal,
    canisterCallContent: CallRequest,
    signature: Uint8Array
  ): Promise<{ response: { ok: boolean; status: number; statusText: string; body: unknown; headers: unknown[] } }> {
    const fetch = global.fetch.bind(global);

    const requestBody = {
      content: canisterCallContent,
      sender_pubkey: this.identity.getPublicKey().toDer(),
      sender_sig: signature,
    };

    const requestBodyCbor = Cbor.encode(requestBody);
    const url = new URL(`/api/v4/canister/${canisterId.toText()}/call`, this.host);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: requestBodyCbor,
    });

    const responseBodyBytes = new Uint8Array(await response.arrayBuffer());
    const responseBody = responseBodyBytes.byteLength > 0 ? Cbor.decode(responseBodyBytes) : null;

    return {
      response: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        body: responseBody,
        headers: [],
      },
    };
  }

  async status(): Promise<Record<string, unknown>> {
    throw new Error("Icrc21Agent.status() is not implemented");
  }

  async query(
    canisterId: Principal | string,
    options: {
      methodName: string;
      arg: Uint8Array;
      effectiveCanisterId?: Principal;
    },
    identity?: Identity | Promise<Identity>
  ): Promise<Record<string, unknown>> {
    throw new Error("Icrc21Agent.query() is not implemented");
  }

  async readState(
    effectiveCanisterId: Principal | string,
    options: { paths: Uint8Array[][] },
    identity?: Identity,
    request?: unknown
  ): Promise<Record<string, unknown>> {
    throw new Error("Icrc21Agent.readState() is not implemented");
  }

  async fetchRootKey(): Promise<Uint8Array> {
    throw new Error("Icrc21Agent.fetchRootKey() is not implemented");
  }
}
