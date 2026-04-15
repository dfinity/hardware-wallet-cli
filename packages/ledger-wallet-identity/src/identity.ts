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
const LedgerApp =
  (LedgerAppModule as any).default?.default ||
  (LedgerAppModule as any).default ||
  LedgerAppModule;
type ResponseSign = LedgerAppModule.ResponseSign;
type TokenInfo = LedgerAppModule.TokenInfo;
import { Secp256k1PublicKey } from "@icp-sdk/core/identity/secp256k1";

import type { LedgerTransport, TransportFactory } from "./transport";

export interface LedgerWalletIdentityOptions {
  /** A function that opens a connection to the Ledger device.
   *  Defaults to WebHID (browser). For Node.js, pass `createNodeHidTransport`
   *  from `@dfinity/ledger-wallet-identity/node`. */
  transportFactory?: TransportFactory;
  /** BIP-44 derivation path. Defaults to `m/44'/223'/0'/0/0`. */
  derivePath?: string;
}

const isNullish = (value: unknown): value is null | undefined =>
  value === null || value === undefined;
const nonNullish = <T>(value: T): value is NonNullable<T> => !isNullish(value);

// Convert a byte array to a hex string
const bytesToHexString = (bytes: number[]): string =>
  bytes.reduce(
    (str, byte) => `${str}${byte.toString(16).padStart(2, "0")}`,
    ""
  );

/**
 * Convert the HttpAgentRequest body into cbor which can be signed by the Ledger Hardware Wallet.
 * @param request - body of the HttpAgentRequest
 */
function _prepareCborForLedger(request: ReadRequest | CallRequest): Uint8Array {
  return Cbor.encode({ content: request });
}

/**
 * A Hardware Ledger Internet Computer Agent identity.
 */
export class LedgerWalletIdentity extends SignIdentity {
  // A flag to signal that the next transaction to be signed will be
  // a "stake neuron" transaction.
  private _neuronStakeFlag = false;

  // A flag to signal that the next transaction to be signed will be
  // an ICRC-21 transaction.
  private _icrc21Flag = false;
  private _icrc21ConsentMessageRequest: CallRequest | null = null;
  private _icrc21ConsentMessageResponseCertificate: Uint8Array | null = null;

  /**
   * Create a LedgerWalletIdentity.
   */
  public static async create(
    options: LedgerWalletIdentityOptions = {}
  ): Promise<LedgerWalletIdentity> {
    const derivePath = options.derivePath ?? `m/44'/223'/0'/0/0`;
    let transportFactory = options.transportFactory;
    if (!transportFactory) {
      const { createWebHidTransport } = await import("./transport-webhid");
      transportFactory = createWebHidTransport;
    }
    const [app, transport] = await this._connect(transportFactory);

    try {
      const publicKey = await this._fetchPublicKeyFromDevice(app, derivePath);
      return new this(transportFactory, derivePath, publicKey);
    } finally {
      // Always close the transport.
      transport.close();
    }
  }

  private constructor(
    private readonly _transportFactory: TransportFactory,
    public readonly derivePath: string,
    private readonly _publicKey: Secp256k1PublicKey
  ) {
    super();
  }

  /**
   * Connect to a ledger hardware wallet.
   */
  private static async _connect(
    transportFactory: TransportFactory
  ): Promise<[typeof LedgerApp, LedgerTransport]> {
    try {
      const transport = await transportFactory();
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
    app: typeof LedgerApp,
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
      new Uint8Array(resp.publicKey)
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
    this._executeWithApp(async (app: typeof LedgerApp) => {
      await app.showAddressAndPubKey(this.derivePath);
    });
  }

  /**
   * @returns The verion of the `Internet Computer' app installed on the Ledger device.
   */
  public async getVersion(): Promise<Version> {
    return this._executeWithApp(async (app: typeof LedgerApp) => {
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
    return this._executeWithApp(async (app: typeof LedgerApp) => {
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
    return await this._executeWithApp(async (app: typeof LedgerApp) => {
      const resp: ResponseSign = await app.sign(
        this.derivePath,
        new Uint8Array(blob),
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

  private async signIcrc21(
    consentRequest: string,
    canisterCall: string,
    certificate: string
  ): Promise<Signature> {
    return await this._executeWithApp(async (app: typeof LedgerApp) => {
      const resp: ResponseSign = await app.signBls(
        this.derivePath,
        consentRequest,
        canisterCall,
        certificate
      );

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

  /**
   * Signals that the upcoming transaction to be signed will be an ICRC-21 transaction.
   */
  public flagUpcomingIcrc21(
    request: CallRequest,
    certificateBytes: Uint8Array
  ): void {
    this._icrc21Flag = true;
    this._icrc21ConsentMessageRequest = request;
    this._icrc21ConsentMessageResponseCertificate = certificateBytes;
  }

  public async transformRequest(request: HttpAgentRequest): Promise<unknown> {
    const { body, ...fields } = request;

    let signature: Signature;

    if (this._icrc21Flag) {
      // Use ICRC-21 signing (consent message verification + signature)
      const consentRequestHex = bytesToHexString(
        Array.from(Cbor.encode({ content: this._icrc21ConsentMessageRequest }))
      );
      const canisterCallHex = bytesToHexString(
        Array.from(_prepareCborForLedger(body))
      );
      const certificateHex = bytesToHexString(
        Array.from(this._icrc21ConsentMessageResponseCertificate!)
      );
      try {
        signature = await this.signIcrc21(
          consentRequestHex,
          canisterCallHex,
          certificateHex
        );
      } finally {
        // Reset the ICRC-21 flag after signing
        this._icrc21Flag = false;
        this._icrc21ConsentMessageRequest = null;
        this._icrc21ConsentMessageResponseCertificate = null;
      }
    } else {
      // Use standard signing for regular transactions
      signature = await this.sign(_prepareCborForLedger(body));
    }

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
    func: (app: typeof LedgerApp) => Promise<T>
  ): Promise<T> {
    const [app, transport] = await LedgerWalletIdentity._connect(
      this._transportFactory
    );

    try {
      // Verify that the public key of the device matches the public key of this identity.
      const devicePublicKey =
        await LedgerWalletIdentity._fetchPublicKeyFromDevice(
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
