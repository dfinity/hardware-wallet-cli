import {
  AnonymousIdentity,
  bufFromBufLike,
  CallRequest,
  Cbor,
  Certificate,
  Expiry,
  HttpAgent,
  HttpAgentRequest,
  HttpDetailsResponse,
  lookupResultToBuffer,
  pollForResponse,
  PublicKey,
  ReadRequest,
  Signature,
  SignIdentity,
  strategy,
  SubmitResponse,
  v2ResponseBody,
  v3ResponseBody,
} from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import LedgerApp, { ResponseSign } from "@zondax/ledger-icp";
import { Secp256k1PublicKey } from "./secp256k1";
import {
  icrc21_consent_message_request,
  icrc21_consent_message_response,
} from "../bls-test/ledger-icp/icrc21.idl";
import * as fs from "fs";

// @ts-ignore (no types are available)
import TransportWebHID, { Transport } from "@ledgerhq/hw-transport-webhid";
import TransportNodeHidNoEvents from "@ledgerhq/hw-transport-node-hid-noevents";

// Add polyfill for `window.fetch` for agent-js to work.
// @ts-ignore (no types are available)
import fetch from "node-fetch";
import { IDL, toHexString } from "@dfinity/candid";
global.fetch = fetch;

/**
 * Convert the HttpAgentRequest body into cbor which can be signed by the Ledger Hardware Wallet.
 * @param request - body of the HttpAgentRequest
 */
function _prepareCborForLedger(
  request: ReadRequest | CallRequest
): ArrayBuffer {
  return Cbor.encode({ content: request });
}

/**
 * A Hardware Ledger Internet Computer Agent identity.
 */
export class LedgerIdentity extends SignIdentity {
  // A flag to signal that the next transaction to be signed will be
  // a "stake neuron" transaction.
  private _neuronStakeFlag = false;

  /**
   * Create a LedgerIdentity using the Web USB transport.
   * @param derivePath The derivation path.
   */
  public static async create(
    derivePath = `m/44'/223'/0'/0/0`
  ): Promise<LedgerIdentity> {
    const [app, transport] = await this._connect();

    try {
      const publicKey = await this._fetchPublicKeyFromDevice(app, derivePath);
      return new this(derivePath, publicKey);
    } finally {
      // Always close the transport.
      transport.close();
    }
  }

  private constructor(
    public readonly derivePath: string,
    private readonly _publicKey: Secp256k1PublicKey
  ) {
    super();
  }

  /**
   * Connect to a ledger hardware wallet.
   */
  private static async _connect(): Promise<[LedgerApp, Transport]> {
    async function getTransport() {
      if (await TransportWebHID.isSupported()) {
        // We're in a web browser.
        return TransportWebHID.create();
      } else if (await TransportNodeHidNoEvents.isSupported()) {
        // Maybe we're in a CLI.
        return TransportNodeHidNoEvents.create();
      } else {
        // Unknown environment.
        throw Error();
      }
    }

    try {
      const transport = await getTransport();
      const app = new LedgerApp(transport);
      return [app, transport];
    } catch (err) {
      // @ts-ignore
      if (err.id && err.id == "NoDeviceFound") {
        throw "No Ledger device found. Is the wallet connected and unlocked?";
      } else if (
        // @ts-ignore
        err.message &&
        // @ts-ignore
        err.message.includes("cannot open device with path")
      ) {
        throw "Cannot connect to Ledger device. Please close all other wallet applications (e.g. Ledger Live) and try again.";
      } else {
        // Unsupported browser. Data on browser compatibility is taken from https://caniuse.com/webhid
        throw `Cannot connect to Ledger Wallet. Either you have other wallet applications open (e.g. Ledger Live), or your browser doesn't support WebHID, which is necessary to communicate with your Ledger hardware wallet.\n\nSupported browsers:\n* Chrome (Desktop) v89+\n* Edge v89+\n* Opera v76+\n\nError: ${err}`;
      }
    }
  }

  private static async _fetchPublicKeyFromDevice(
    app: LedgerApp,
    derivePath: string
  ): Promise<Secp256k1PublicKey> {
    const resp = await app.getAddressAndPubKey(derivePath);
    // @ts-ignore
    if (resp.returnCode == 28161) {
      throw "Please open the Internet Computer app on your wallet and try again.";
      // @ts-ignore
    } else if (resp.returnCode == 65535) {
      throw "Unable to fetch the public key. Please try again.";
    }
    // TODO: Manage all return codes that are errors.

    // This type doesn't have the right fields in it, so we have to manually type it.
    const principal = (resp as unknown as { principalText: string })
      .principalText;
    const publicKey = Secp256k1PublicKey.fromRaw(
      new Uint8Array(resp.publicKey as Buffer)
    );

    if (
      principal !==
      Principal.selfAuthenticating(new Uint8Array(publicKey.toDer())).toText()
    ) {
      throw new Error(
        "Principal returned by device does not match public key."
      );
    }

    return publicKey;
  }

  /**
   * Required by Ledger.com that the user should be able to press a Button in UI
   * and verify the address/pubkey are the same as on the device screen.
   */
  public async showAddressAndPubKeyOnDevice(): Promise<void> {
    this._executeWithApp(async (app: LedgerApp) => {
      await app.showAddressAndPubKey(this.derivePath);
    });
  }

  /**
   * @returns The verion of the `Internet Computer' app installed on the Ledger device.
   */
  public async getVersion(): Promise<Version> {
    return this._executeWithApp(async (app: LedgerApp) => {
      const res = await app.getVersion();
      return {
        major: res.major,
        minor: res.minor,
        patch: res.patch,
      };
    });
  }

  public getPublicKey(): PublicKey {
    return this._publicKey;
  }

  public async signBls(
    consentRequest: string,
    canisterCall: string,
    certificate: string
  ): Promise<Signature> {
    console.log("in da signBls");
    return await this._executeWithApp(async (app: LedgerApp) => {
      const resp: ResponseSign = await app.signBls(
        this.derivePath,
        consentRequest,
        canisterCall,
        certificate
      );

      // Remove the "neuron stake" flag, since we already signed the transaction.
      this._neuronStakeFlag = false;

      const signatureRS = resp.signatureRS;
      if (!signatureRS) {
        throw new Error(
          `A ledger error happened during signature:\n` +
            `Code: ${resp.returnCode}\n` +
            `Message: ${JSON.stringify(resp.errorMessage)}\n`
        );
      }

      if (signatureRS?.byteLength !== 64) {
        throw new Error(
          `Signature must be 64 bytes long (is ${signatureRS.length})`
        );
      }

      return bufferToArrayBuffer(signatureRS) as Signature;
    });
  }

  public async sign(blob: ArrayBuffer): Promise<Signature> {
    console.log("in da sign");
    return await this._executeWithApp(async (app: LedgerApp) => {
      const resp: ResponseSign = await app.sign(
        this.derivePath,
        Buffer.from(blob),
        this._neuronStakeFlag ? 1 : 0
      );

      // Remove the "neuron stake" flag, since we already signed the transaction.
      this._neuronStakeFlag = false;

      const signatureRS = resp.signatureRS;
      if (!signatureRS) {
        throw new Error(
          `A ledger error happened during signature:\n` +
            `Code: ${resp.returnCode}\n` +
            `Message: ${JSON.stringify(resp.errorMessage)}\n`
        );
      }

      if (signatureRS?.byteLength !== 64) {
        throw new Error(
          `Signature must be 64 bytes long (is ${signatureRS.length})`
        );
      }

      return bufferToArrayBuffer(signatureRS) as Signature;
    });
  }

  /**
   * Signals that the upcoming transaction to be signed will be a "stake neuron" transaction.
   */
  public flagUpcomingStakeNeuron(): void {
    this._neuronStakeFlag = true;
  }

  private getResponseData = async (
    { requestId, response, requestDetails }: SubmitResponse,
    agent: HttpAgent,
    canisterId: Principal
  ) => {
    let reply: ArrayBuffer | undefined;
    let certificate: Certificate | undefined;
    if (response.body && (response.body as v3ResponseBody).certificate) {
      const cert = (response.body as v3ResponseBody).certificate;
      certificate = await Certificate.create({
        certificate: bufFromBufLike(cert),
        rootKey: agent.rootKey,
        canisterId,
      });
      const path = [new TextEncoder().encode("request_status"), requestId];
      const status = new TextDecoder().decode(
        lookupResultToBuffer(certificate.lookup([...path, "status"]))
      );

      switch (status) {
        case "replied":
          reply = lookupResultToBuffer(certificate.lookup([...path, "reply"]));
          break;
        case "rejected": {
          // Find rejection details in the certificate
          const rejectCode = new Uint8Array(
            lookupResultToBuffer(certificate.lookup([...path, "reject_code"]))!
          )[0];
          const rejectMessage = new TextDecoder().decode(
            lookupResultToBuffer(
              certificate.lookup([...path, "reject_message"])
            )!
          );
          const error_code_buf = lookupResultToBuffer(
            certificate.lookup([...path, "error_code"])
          );
          const error_code = error_code_buf
            ? new TextDecoder().decode(error_code_buf)
            : undefined;
          throw new Error("Call rejected: " + rejectMessage);
        }
      }
    } else if (response.body && "reject_message" in response.body) {
      // handle v2 response errors by throwing an UpdateCallRejectedError object
      const { reject_code, reject_message, error_code } =
        response.body as v2ResponseBody;
      throw new Error("Call rejected: " + reject_message);
    }

    // Fall back to polling if we receive an Accepted response code
    if (response.status === 202) {
      // Contains the certificate and the reply from the boundary node
      const response = await pollForResponse(
        agent,
        canisterId,
        requestId,
        strategy.defaultStrategy()
      );
      certificate = response.certificate;
      reply = response.reply;
    }

    const httpDetails = { ...response, requestDetails } as HttpDetailsResponse;
    if (reply !== undefined) {
      return {
        httpDetails,
        certificate,
        result: IDL.decode(
          [icrc21_consent_message_response],
          Buffer.from(reply)
        ),
      };
    } else {
      throw new Error(`Call was returned undefined, but type [].`);
    }
  };

  public async transformRequest(request: HttpAgentRequest): Promise<unknown> {
    const { body, ...fields } = request;
    if (body.request_type === "read_state") {
      console.log("in da read_state", body);
      const signature = await this.sign(_prepareCborForLedger(body));
      return {
        ...fields,
        body: {
          content: body,
          sender_pubkey: this._publicKey.toDer(),
          sender_sig: signature,
        },
      };
    }

    if (body.request_type === "call") {
      // Not always necessary.
      body.ingress_expiry = new Expiry(300_000);
    }
    const anonymousIdentity = new AnonymousIdentity();
    const anonymousAgent = await HttpAgent.create({
      identity: anonymousIdentity,
    });

    // CHAT Ledger
    // const canisterId = Principal.fromText("ekfwe-siaaa-aaaaf-qapta-cai");
    // CkBTC Ledger
    // const canisterId = Principal.fromText("mxzaz-hqaaa-aaaar-qaada-cai");
    // ICP Ledger
    // const canisterId = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
    // Test canister
    const canisterId = Principal.fromText("suje7-zaaaa-aaaad-abnzq-cai");
    const consentMessageArgs = {
      arg: body.arg,
      method: "greet",
      user_preferences: {
        metadata: {
          language: "en",
          utc_offset_minutes: [],
        },
        device_spec: [
          {
            FieldsDisplay: null,
          },
        ],
      },
    };
    const arg = IDL.encode(
      [icrc21_consent_message_request],
      [consentMessageArgs]
    );
    const icrc21ConsentMessageCall = {
      methodName: "icrc21_canister_call_consent_message",
      arg,
      callSync: true,
    };
    const submitResponse = await anonymousAgent.call(
      canisterId,
      icrc21ConsentMessageCall
    );
    const responseData = await this.getResponseData(
      submitResponse,
      anonymousAgent,
      canisterId
    );
    const consentRequest = toHexString(
      _prepareCborForLedger(submitResponse.requestDetails as CallRequest)
    );
    const canisterCall = toHexString(_prepareCborForLedger(body));
    const cert = (submitResponse.response.body as v3ResponseBody).certificate;
    const certificate = toHexString(cert);
    const data = {
      consentRequest: submitResponse.requestDetails,
      consentRequestArgs: consentMessageArgs,
      consentRequestHex: consentRequest,
      consentResponse: responseData.result[0],
      cansiterCall: body,
      canisterCallHex: canisterCall,
      certificate,
    };

    fs.writeFileSync(
      "output.json",
      JSON.stringify(data, (key, value) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        if (value instanceof Principal) {
          return value.toText();
        }
        if (value instanceof Uint8Array) {
          return Array.from(value);
        }
        return value;
      })
    );
    const signature = await this.signBls(
      consentRequest,
      canisterCall,
      certificate
    );
    console.log("after da signBls");
    return {
      ...fields,
      body: {
        content: body,
        sender_pubkey: this._publicKey.toDer(),
        sender_sig: signature,
      },
    };
  }

  private async _executeWithApp<T>(
    func: (app: LedgerApp) => Promise<T>
  ): Promise<T> {
    const [app, transport] = await LedgerIdentity._connect();

    try {
      // Verify that the public key of the device matches the public key of this identity.
      const devicePublicKey = await LedgerIdentity._fetchPublicKeyFromDevice(
        app,
        this.derivePath
      );
      if (JSON.stringify(devicePublicKey) !== JSON.stringify(this._publicKey)) {
        throw new Error(
          "Found unexpected public key. Are you sure you're using the right wallet?"
        );
      }

      // Run the provided function.
      return await func(app);
    } finally {
      transport.close();
    }
  }
}

interface Version {
  major?: number;
  minor?: number;
  patch?: number;
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

// This was used to prove that the the call to read_state also happens with the anonynoys identity.
// The error has nothing to do with the ICRC-21 flow.
export class AnonymousIdentityWrapper extends AnonymousIdentity {
  public async transformRequest(request: HttpAgentRequest): Promise<unknown> {
    const { body, ...fields } = request;
    console.log("transformRequest", request);
    if (body.request_type === "read_state") {
      console.log("in da read_state");
      if ("toText" in body.sender) {
        console.log("sender is a Principal", body.sender.toText());
      }
      return request;
    }
    return request;
  }
}
