import { Principal } from "@icp-sdk/core/principal";
import type {
  Agent,
  CallOptions,
  Identity,
  SubmitResponse,
  CallRequest,
  ApiQueryResponse,
  QueryFields,
  ReadStateOptions,
  ReadStateResponse,
  UpdateResult,
  PollingOptions,
} from "@icp-sdk/core/agent";
import type { JsonObject } from "@icp-sdk/core/candid";
import { HttpAgent, AnonymousIdentity } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
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
 * the actual call signing to the provided identity via the ICRC-21 consent flow.
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

  /** Executes an update call through the ICRC-21 consent message flow and returns the certified reply. */
  async update(
    canisterIdArg: Principal | string,
    fields: CallOptions,
    pollingOptions?: PollingOptions
  ): Promise<UpdateResult> {
    const canisterId = Principal.from(canisterIdArg);

    // Fetch the consent message from the canister.
    // Returns the request and the certificate that contains the response.
    const { request, certificate } = await this.fetchConsentMessage(
      canisterId,
      fields
    );

    // Flag the identity so transformRequest will use ICRC-21 signing
    this.identity.flagUpcomingIcrc21(request, certificate);

    // Send the canister call via the signing agent which triggers ICRC-21 approval.
    return this.signingAgent.update(
      canisterId,
      {
        methodName: fields.methodName,
        arg: fields.arg,
        effectiveCanisterId: fields.effectiveCanisterId,
      },
      pollingOptions
    );
  }

  /** Required by the Agent interface. Prefer {@link update} for direct usage. */
  async call(
    canisterIdArg: Principal | string,
    fields: CallOptions
  ): Promise<SubmitResponse> {
    const result = await this.update(canisterIdArg, fields);
    return {
      requestId: result.requestDetails?.request_id ?? (new Uint8Array() as any),
      response: result.callResponse,
      requestDetails: result.requestDetails,
    };
  }

  /**
   * Calls icrc21_canister_call_consent_message on the target canister and returns
   * the call request details and response certificate, both needed by the Ledger
   * device for ICRC-21 signing. Throws if the canister rejects the call or returns
   * an ICRC-21 error.
   */
  private async fetchConsentMessage(
    canisterId: Principal,
    fields: CallOptions
  ): Promise<{ request: CallRequest; certificate: Uint8Array }> {
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

    // Use update() to get the certified result directly.
    // This handles polling and throws on rejection automatically.
    const result = await this.anonymousAgent.update(canisterId, {
      methodName: "icrc21_canister_call_consent_message",
      arg: consentMessageRequest,
      effectiveCanisterId: canisterId,
    });

    // Check for ICRC-21 specific errors in the reply
    this.checkForIcrc21Error(result.reply);

    const request = result.requestDetails;
    if (!request) {
      throw new Error("Missing request details from consent message call");
    }

    return { request, certificate: result.rawCertificate };
  }

  /** Throws if the consent message response contains an ICRC-21 error. */
  private checkForIcrc21Error(replyBytes: Uint8Array): void {
    const [decoded] = IDL.decode(
      [icrc21_consent_message_response],
      replyBytes
    ) as [Record<string, unknown>];
    if ("Err" in decoded) {
      const err = decoded.Err as Record<string, { description: string }>;
      const variant = Object.keys(err)[0];
      const description = Object.values(err)[0]?.description ?? "Unknown error";
      throw new Error(
        `ICRC-21 consent message error: ${variant} - ${description}`
      );
    }
  }

  async fetchRootKey(): Promise<Uint8Array> {
    throw new Error("Icrc21Agent does not implement fetchRootKey()");
  }

  async status(): Promise<JsonObject> {
    throw new Error("Icrc21Agent does not implement status()");
  }

  async query(
    canisterId: Principal | string,
    options: QueryFields,
    identity?: Identity | Promise<Identity>
  ): Promise<ApiQueryResponse> {
    throw new Error("Icrc21Agent does not implement query()");
  }

  async readState(
    effectiveCanisterId: Principal | string,
    options: ReadStateOptions,
    identity?: Identity,
    request?: unknown
  ): Promise<ReadStateResponse> {
    throw new Error("Icrc21Agent does not implement readState()");
  }
}
