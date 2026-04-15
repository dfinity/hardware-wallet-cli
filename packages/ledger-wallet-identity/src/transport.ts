/**
 * Minimal transport interface expected by LedgerWalletIdentity.
 * Compatible with @ledgerhq/hw-transport.
 */
export interface LedgerTransport {
  close(): Promise<void>;
  send(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data?: Uint8Array,
    statusList?: number[]
  ): Promise<Uint8Array>;
}

/**
 * A function that opens a connection to a Ledger device and returns a transport.
 */
export type TransportFactory = () => Promise<LedgerTransport>;
