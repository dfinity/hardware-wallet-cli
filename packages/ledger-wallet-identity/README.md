# @dfinity/ledger-wallet-identity

A [Ledger](https://www.ledger.com/) hardware wallet identity for the [Internet Computer](https://internetcomputer.org/).

This package provides `LedgerWalletIdentity`, an implementation of the `SignIdentity` interface from `@icp-sdk/core` that signs transactions using a Ledger hardware wallet. It supports both browser (WebHID) and Node.js (node-hid) environments.

## Installation

```bash
npm install @dfinity/ledger-wallet-identity
```

In Node.js environments, you also need `node-hid`:

```bash
npm install node-hid
```

## Usage

By default, `LedgerWalletIdentity.create()` uses the WebHID transport (browser):

```typescript
import { LedgerWalletIdentity } from "@dfinity/ledger-wallet-identity";
import { HttpAgent } from "@icp-sdk/core/agent";

const identity = await LedgerWalletIdentity.create();
const agent = new HttpAgent({ identity });
```

> **Note:** `@zondax/ledger-icp` (a transitive dependency) uses Node.js `Buffer`. Browser bundlers will need a `buffer` polyfill (e.g. the [`buffer`](https://www.npmjs.com/package/buffer) package).

### Node.js

Import from `@dfinity/ledger-wallet-identity/node` and pass `createNodeHidTransport`:

```typescript
import {
  LedgerWalletIdentity,
  createNodeHidTransport,
} from "@dfinity/ledger-wallet-identity/node";

const identity = await LedgerWalletIdentity.create({
  transportFactory: createNodeHidTransport,
});
```

### Custom derivation path

```typescript
const identity = await LedgerWalletIdentity.create({
  derivePath: "m/44'/223'/0'/0/1",
});
```

### ICRC-21 consent message signing

`LedgerWalletIdentity` supports [ICRC-21](https://github.com/dfinity/wg-identity-authentication/blob/main/topics/ICRC-21/icrc_21_consent_msg.md) consent message signing via `flagUpcomingIcrc21()`. Use it with [`@dfinity/icrc21-agent`](https://www.npmjs.com/package/@dfinity/icrc21-agent) for transparent consent message flows:

```typescript
import { LedgerWalletIdentity } from "@dfinity/ledger-wallet-identity";
import { Icrc21Agent } from "@dfinity/icrc21-agent";

const identity = await LedgerWalletIdentity.create();
const agent = await Icrc21Agent.create(identity);
```

## License

Apache-2.0
