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

  flagUpcomingIcrc21(consentRequestHex: string, certificateHex: string): void {
    this._icrc21Flag = true;
    this._consentRequestHex = consentRequestHex;
    this._certificateHex = certificateHex;
    this.flagCallCount++;
  }

  async transformRequest(request: HttpAgentRequest): Promise<unknown> {
    // Clear the flag like LedgerIdentity does
    if (this._icrc21Flag) {
      this._icrc21Flag = false;
      this._consentRequestHex = "";
      this._certificateHex = "";
    }
    return super.transformRequest(request);
  }
}
