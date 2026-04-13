import {
  SignIdentity,
  HttpAgentRequest,
  PublicKey,
  Signature,
} from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import type { Icrc21Identity } from "../src/icrc21-identity";

/**
 * A mock identity that satisfies Icrc21Identity without requiring Ledger hardware.
 * Uses Ed25519 signing internally. Tracks flagUpcomingIcrc21 calls for assertions.
 */
export class MockIcrc21Identity extends SignIdentity implements Icrc21Identity {
  private readonly inner: Ed25519KeyIdentity;
  private _icrc21Flag = false;
  private _consentRequestHex = "";
  private _certificateHex = "";

  /** Number of times flagUpcomingIcrc21 was called. */
  flagCallCount = 0;

  /** Set to true to simulate a user rejection on the next signing attempt. */
  rejectNextSign = false;

  constructor() {
    super();
    this.inner = Ed25519KeyIdentity.generate();
  }

  getPublicKey(): PublicKey {
    return this.inner.getPublicKey();
  }

  async sign(blob: Uint8Array): Promise<Signature> {
    return this.inner.sign(blob);
  }

  get icrc21Flag(): boolean {
    return this._icrc21Flag;
  }

  flagUpcomingIcrc21(consentRequestHex: string, certificateHex: string): void {
    this._icrc21Flag = true;
    this._consentRequestHex = consentRequestHex;
    this._certificateHex = certificateHex;
    this.flagCallCount++;
  }

  async transformRequest(request: HttpAgentRequest): Promise<unknown> {
    if (this._icrc21Flag) {
      try {
        if (this.rejectNextSign) {
          this.rejectNextSign = false;
          throw new Error("User rejected signing on device");
        }
      } finally {
        this._icrc21Flag = false;
        this._consentRequestHex = "";
        this._certificateHex = "";
      }
    }
    return super.transformRequest(request);
  }
}
