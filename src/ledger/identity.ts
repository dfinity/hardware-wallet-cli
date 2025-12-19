import {
  Cbor,
  CallRequest,
  HttpAgentRequest,
  PublicKey,
  ReadRequest,
  Signature,
  SignIdentity,
} from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
// @ts-ignore
import * as LedgerAppModule from "@zondax/ledger-icp";
// Handle ESM/CJS interop - ESM may have nested default exports
const LedgerApp = (LedgerAppModule as any).default?.default || (LedgerAppModule as any).default || LedgerAppModule;
type ResponseSign = LedgerAppModule.ResponseSign;
type TokenInfo = LedgerAppModule.TokenInfo;
import { Secp256k1PublicKey } from "./secp256k1";

// @ts-ignore (no types are available)
import * as TransportWebHIDModule from "@ledgerhq/hw-transport-webhid";
import * as TransportNodeHidNoEventsModule from "@ledgerhq/hw-transport-node-hid-noevents";

// Handle ESM/CJS interop - ESM may have nested default exports
const TransportWebHID = (TransportWebHIDModule as any).default?.default || (TransportWebHIDModule as any).default || TransportWebHIDModule;
const TransportNodeHidNoEvents = (TransportNodeHidNoEventsModule as any).default?.default || (TransportNodeHidNoEventsModule as any).default || TransportNodeHidNoEventsModule;
type Transport = typeof TransportWebHID;

import { isNullish, nonNullish } from "@dfinity/utils";

// Set global.fetch for agent-js compatibility (Node 18+ has native fetch)
(global as any).fetch = fetch;

/**
 * Convert the HttpAgentRequest body into cbor which can be signed by the Ledger Hardware Wallet.
 * @param request - body of the HttpAgentRequest
 */
function _prepareCborForLedger(
  request: ReadRequest | CallRequest
): Uint8Array {
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
        // CLI environment.
        // Use list() + open() instead of create() to work around a bug in the
        // @ledgerhq library that throws "Cannot access 'X' before initialization".
        const devices = await TransportNodeHidNoEvents.list();
        if (devices.length === 0) {
          const err = new Error("No Ledger device found") as Error & { id: string };
          err.id = "NoDeviceFound";
          throw err;
        }
        return TransportNodeHidNoEvents.open(devices[0]);
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
    // Code references: https://github.com/Zondax/ledger-js/blob/799b056c0ed40af06d375b2b6220c0316f272fe7/src/consts.ts#L31
    if (resp.returnCode == 0x6e01) {
      throw "Please open the Internet Computer app on your wallet and try again.";
    } else if (resp.returnCode == 0x5515) {
      throw "Ledger Wallet is locked. Unlock it and try again.";
    } else if (resp.returnCode == 0xffff) {
      throw "Unable to fetch the public key. Please try again.";
    } else if (isNullish(resp.publicKey)) {
      throw "Public key not available. Please try again.";
    }

    // This type doesn't have the right fields in it, so we have to manually type it.
    const principal = (resp as unknown as { principalText: string })
      .principalText;
    const publicKey = Secp256k1PublicKey.fromRaw(
      new Uint8Array(resp.publicKey).buffer
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
      if (
        isNullish(res.major) ||
        isNullish(res.minor) ||
        isNullish(res.patch)
      ) {
        throw new Error(
          `A ledger error happened during version fetch:
          Code: ${res.returnCode}
          Message: ${JSON.stringify(res.errorMessage)}`
        );
      }
      return {
        major: res.major,
        minor: res.minor,
        patch: res.patch,
      };
    });
  }

  public async getSupportedTokens(): Promise<TokenInfo[]> {
    return this._executeWithApp(async (app: LedgerApp) => {
      const res = await app.tokenRegistry();
      if (nonNullish(res.tokenRegistry)) {
        return res.tokenRegistry;
      }
      throw new Error(
        `A ledger error happened during token registry fetch:
          Code: ${res.returnCode}
          Message: ${JSON.stringify(res.errorMessage)}`
      );
    });
  }

  public getPublicKey(): PublicKey {
    return this._publicKey;
  }

  public async sign(blob: Uint8Array): Promise<Signature> {
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

      return new Uint8Array(signatureRS) as Signature;
    });
  }

  /**
   * Signals that the upcoming transaction to be signed will be a "stake neuron" transaction.
   */
  public flagUpcomingStakeNeuron(): void {
    this._neuronStakeFlag = true;
  }

  public async transformRequest(request: HttpAgentRequest): Promise<unknown> {
    const { body, ...fields } = request;
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
  major: number;
  minor: number;
  patch: number;
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}
