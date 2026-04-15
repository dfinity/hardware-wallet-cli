# @dfinity/icrc21-agent

An [ICRC-21](https://github.com/dfinity/wg-identity-authentication/blob/main/topics/ICRC-21/icrc_21_consent_msg.md) consent message agent for the [Internet Computer](https://internetcomputer.org/).

This package implements the IC `Agent` interface and transparently handles the ICRC-21 consent message flow. When you make a canister call, the agent:

1. Fetches the consent message from the target canister (`icrc21_canister_call_consent_message`).
2. Passes the consent message and certificate to your identity (e.g. a Ledger hardware wallet) for user approval.
3. Sends the signed call to the canister and verifies the result.

## Installation

```bash
npm install @dfinity/icrc21-agent
```

## Usage

### With an Actor (recommended)

Use `Icrc21Agent` as the agent for any `@icp-sdk/core` Actor to get transparent ICRC-21 consent flows on every update call.

```typescript
import { Icrc21Agent } from "@dfinity/icrc21-agent";
import { LedgerWalletIdentity } from "@dfinity/ledger-wallet-identity";
import { Actor } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";

// Define your canister's IDL factory
const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    swap: IDL.Func([IDL.Text, IDL.Text, IDL.Nat], [IDL.Text], []),
  });
};

// Connect to the Ledger hardware wallet
const identity = await LedgerWalletIdentity.create();

// Create the ICRC-21 agent
const agent = await Icrc21Agent.create(identity);

// Create an Actor using the ICRC-21 agent
const canisterId = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
const actor = Actor.createActor(idlFactory, {
  agent,
  canisterId,
});

// Every update call now goes through the ICRC-21 consent flow automatically.
// The user will review and approve the consent message on the Ledger device before signing.
// Swap 0.1 ckBTC to ICP (ckBTC has 8 decimals)
const result = await actor.swap("ckBTC", "ICP", 10_000_000n);
```

See the [ICRC-21 swap example](https://github.com/dfinity/hardware-wallet-cli/tree/main/examples/icrc21-swap) for a complete working frontend app.

### Direct call

You can also use `Icrc21Agent.update()` directly without an Actor. This returns the certified reply bytes directly.

```typescript
import { Icrc21Agent } from "@dfinity/icrc21-agent";
import { LedgerWalletIdentity } from "@dfinity/ledger-wallet-identity";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";

const identity = await LedgerWalletIdentity.create();
const agent = await Icrc21Agent.create(identity);

const canisterId = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
const arg = IDL.encode(
  [IDL.Text, IDL.Text, IDL.Nat],
  ["ckBTC", "ICP", 10_000_000n]
);

const result = await agent.update(canisterId, {
  methodName: "swap",
  arg,
  effectiveCanisterId: canisterId,
});

const reply = IDL.decode([IDL.Text], result.reply)[0];
```

## Limitations

- Only **update calls** (`update()`, `call()`) are supported. `query()`, `readState()`, and `status()` are not implemented.
- Consent messages are requested in English with `FieldsDisplay` format (a constraint of current Ledger firmware).
- The target canister must implement the [`icrc21_canister_call_consent_message`](https://github.com/dfinity/wg-identity-authentication/blob/main/topics/ICRC-21/icrc_21_consent_msg.md) method.

## ICRC-21 Errors

The agent will throw descriptive errors if the canister returns an ICRC-21 error:

| Error variant               | Meaning                                             |
| --------------------------- | --------------------------------------------------- |
| `UnsupportedCanisterCall`   | The canister does not support the requested method. |
| `ConsentMessageUnavailable` | The consent message could not be produced.          |
| `InsufficientPayment`       | The call requires payment.                          |
| `GenericError`              | An unspecified error with a description and code.   |

## Learn more

- [ICRC-21 specification](https://github.com/dfinity/wg-identity-authentication/blob/main/topics/ICRC-21/icrc_21_consent_msg.md)
- [Internet Computer developer docs](https://internetcomputer.org/docs)
- [Wallet integration skills](https://skills.internetcomputer.org/)
