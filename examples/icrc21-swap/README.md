# ICRC-21 Swap Example

A minimal browser app that performs a token swap on the [Internet Computer](https://internetcomputer.org/) using a Ledger hardware wallet with [ICRC-21](https://github.com/dfinity/wg-identity-authentication/blob/main/topics/ICRC-21/icrc_21_consent_msg.md) consent messages.

The app connects to canister [`xxydu-fqaaa-aaaam-ad2ka-cai`](https://dashboard.internetcomputer.org/canister/xxydu-fqaaa-aaaam-ad2ka-cai) on IC mainnet, using [`@dfinity/ledger-wallet-identity`](../../packages/ledger-wallet-identity/) and [`@dfinity/icrc21-agent`](../../packages/icrc21-agent/).

## Prerequisites

- **Chrome** or **Edge** (WebHID is required)
- A **Ledger** device with the **Internet Computer** app open

## Run

From the repo root:

```bash
pnpm install
pnpm build
```

Then start the dev server:

```bash
cd examples/icrc21-swap
pnpm dev
```

Open the URL printed in the terminal (e.g. `http://localhost:8000`).

## How it works

1. User fills in swap parameters and clicks **Swap**.
2. The app connects to the Ledger via WebHID (`LedgerWalletIdentity.create()`).
3. An `Icrc21Agent` fetches the consent message from the canister and passes it to the Ledger for approval.
4. The user reviews and approves the consent message on the Ledger device.
5. The signed transaction is submitted and the result is displayed.

## Note for bundlers

`@zondax/ledger-icp` (a transitive dependency) uses Node.js `Buffer`. This example includes a [`buffer`](https://www.npmjs.com/package/buffer) polyfill injected via esbuild — see `esbuild.mjs` and `buffer-shim.mjs`.
