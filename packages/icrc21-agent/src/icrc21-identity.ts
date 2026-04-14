import type { SignIdentity, CallRequest } from "@icp-sdk/core/agent";

/**
 * The subset of identity capabilities that Icrc21Agent requires.
 * Any SignIdentity that also has flagUpcomingIcrc21 satisfies this.
 */
export type Icrc21Identity = SignIdentity & {
  flagUpcomingIcrc21(request: CallRequest, certificateBytes: Uint8Array): void;
};
