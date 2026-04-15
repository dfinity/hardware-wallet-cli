import type { TransportFactory } from "./transport";

// @ts-ignore (no types are available)
import * as TransportWebHIDModule from "@ledgerhq/hw-transport-webhid";

// Handle ESM/CJS interop - ESM may have nested default exports
const TransportWebHID =
  (TransportWebHIDModule as any).default?.default ||
  (TransportWebHIDModule as any).default ||
  TransportWebHIDModule;

export const createWebHidTransport: TransportFactory = async () => {
  return TransportWebHID.create();
};
