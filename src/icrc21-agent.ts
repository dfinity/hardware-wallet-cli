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
  Cbor,
  AnonymousIdentity,
  Certificate,
  lookupResultToBuffer,
} from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { bytesToHexString } from "./utils";
import type { Icrc21Identity } from "./icrc21-identity";

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

// Response types for decoding and error checking
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
  Ok: IDL.Reserved,
  Err: icrc21_error,
});

/**
 * Agent that implements the ICRC-21 consent message flow for Ledger hardware wallet signing.
 *
 * Uses an anonymous agent to fetch consent messages from canisters, then delegates
 * the actual call signing to the provided identity via BLS signatures.
 */
export class Icrc21Agent implements Agent {
  private readonly anonymousAgent: HttpAgent;
  private readonly signingAgent: HttpAgent;
  private readonly identity: Icrc21Identity;

  private static readonly DEFAULT_GATEWAY = new URL("https://icp0.io");

  private constructor(identity: Icrc21Identity, gateway: URL) {
    this.identity = identity;

    const host = gateway.toString();
    this.anonymousAgent = HttpAgent.createSync({
      identity: new AnonymousIdentity(),
      host,
    });

    this.signingAgent = HttpAgent.createSync({
      identity,
      host,
    });
  }

  static async create(
    identity: Icrc21Identity,
    gateway: URL = Icrc21Agent.DEFAULT_GATEWAY
  ): Promise<Icrc21Agent> {
    const agent = new Icrc21Agent(identity, gateway);
    const isMainnet = gateway.host === "ic0.app" || gateway.host === "icp0.io";
    if (!isMainnet) {
      await Promise.all([
        agent.anonymousAgent.fetchRootKey(),
        agent.signingAgent.fetchRootKey(),
      ]);
    }
    return agent;
  }

  get rootKey(): Uint8Array | null {
    return this.anonymousAgent.rootKey;
  }

  async getPrincipal(): Promise<Principal> {
    return this.signingAgent.getPrincipal();
  }

  /** Executes a canister call through the ICRC-21 consent message flow. */
  async call(
    canisterIdArg: Principal | string,
    fields: CallOptions
  ): Promise<SubmitResponse> {
    const canisterId = Principal.from(canisterIdArg);

    // Fetch the consent message from the canister
    const { consentRequest, certificateBytes } = await this.getConsentMessage(canisterId, fields);

    // Encode consent request and certificate as hex for the Ledger device
    const consentRequestHex = bytesToHexString(Cbor.encode({ content: consentRequest }));
    const certificateHex = bytesToHexString(certificateBytes);

    // Flag the identity so transformRequest will use BLS signing
    this.identity.flagUpcomingIcrc21(consentRequestHex, certificateHex);

    // Submit the actual canister call
    const result = await this.signingAgent.call(canisterId, {
      methodName: fields.methodName,
      arg: fields.arg,
      effectiveCanisterId: canisterId,
    });

    // Verify the call wasn't rejected by the canister
    this.checkForRejection(result);

    return result;
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
              // Ledger hardware wallet firmware only supports "en"
              language: "en",
              utc_offset_minutes: [],
            },
            // Ledger firmware rejects GenericDisplayMessage due to unsupported characters
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

    // Decode the certificate and check for ICRC-21 errors
    const cert = Certificate.createUnverified({
      certificate: certificateBytes,
      rootKey,
      principal: canisterId,
    });
    const requestId = consentMessageSubmitResponse.requestId;
    const replyPath = [
      new TextEncoder().encode("request_status"),
      requestId,
      new TextEncoder().encode("reply"),
    ];
    this.checkForRejection(consentMessageSubmitResponse, cert);

    const replyBytes = lookupResultToBuffer(cert.lookup_path(replyPath));
    if (replyBytes) {
      const [decoded] = IDL.decode(
        [icrc21_consent_message_response],
        replyBytes
      ) as [Record<string, unknown>];
      if ("Err" in decoded) {
        const err = decoded.Err as Record<string, { description: string }>;
        const variant = Object.keys(err)[0];
        const description = Object.values(err)[0]?.description ?? "Unknown error";
        throw new Error(`ICRC-21 consent message error: ${variant} - ${description}`);
      }
    }

    const consentRequest = consentMessageSubmitResponse.requestDetails;

    return { consentRequest, certificateBytes };
  }

  private checkForRejection(
    response: SubmitResponse,
    cert?: ReturnType<typeof Certificate.createUnverified>
  ): void {
    const rootKey = this.anonymousAgent.rootKey;
    if (!rootKey) return;

    if (!cert) {
      const body = response.response.body as v4ResponseBody | undefined;
      if (!body?.certificate) return;

      const certificateBytes = new Uint8Array(body.certificate);
      cert = Certificate.createUnverified({
        certificate: certificateBytes,
        rootKey,
        // Principal is only used for certificate verification, not path lookup
        principal: Principal.fromText("aaaaa-aa"),
      });
    }

    const requestId = response.requestId;
    const statusBytes = lookupResultToBuffer(
      cert.lookup_path([
        new TextEncoder().encode("request_status"),
        requestId,
        new TextEncoder().encode("status"),
      ])
    );

    if (statusBytes && new TextDecoder().decode(statusBytes) === "rejected") {
      const rejectMsgBytes = lookupResultToBuffer(
        cert.lookup_path([
          new TextEncoder().encode("request_status"),
          requestId,
          new TextEncoder().encode("reject_message"),
        ])
      );
      const rejectMsg = rejectMsgBytes
        ? new TextDecoder().decode(rejectMsgBytes)
        : "Unknown rejection";
      throw new Error(`Call rejected: ${rejectMsg}`);
    }
  }

  async status(): Promise<Record<string, unknown>> {
    throw new Error("Icrc21Agent does not implement status()");
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
    throw new Error("Icrc21Agent does not implement query()");
  }

  async readState(
    effectiveCanisterId: Principal | string,
    options: { paths: Uint8Array[][] },
    identity?: Identity,
    request?: unknown
  ): Promise<Record<string, unknown>> {
    throw new Error("Icrc21Agent does not implement readState()");
  }

}
