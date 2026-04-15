import type { TransportFactory } from "./transport";

import * as TransportNodeHidNoEventsModule from "@ledgerhq/hw-transport-node-hid-noevents";

// Handle ESM/CJS interop - ESM may have nested default exports
const TransportNodeHidNoEvents =
  (TransportNodeHidNoEventsModule as any).default?.default ||
  (TransportNodeHidNoEventsModule as any).default ||
  TransportNodeHidNoEventsModule;

export const createNodeHidTransport: TransportFactory = async () => {
  // Use list() + open() instead of create() to work around a bug in the
  // @ledgerhq library that throws "Cannot access 'X' before initialization".
  const devices = await TransportNodeHidNoEvents.list();
  if (devices.length === 0) {
    const err = new Error("No Ledger device found") as Error & {
      id: string;
    };
    err.id = "NoDeviceFound";
    throw err;
  }
  return TransportNodeHidNoEvents.open(devices[0]);
};
