# hardware-wallet-cli

A CLI to interact with the Internet Computer App on Ledger Nano S/X devices.

## Important Note

> [!WARNING]
> The CLI does NOT support tokens with different than eight decimals at the moment.

**Do NOT USE the cli to transfer ckETH or ckERC20 tokens.**

## Quick Start

- Install the CLI: `npm install -g @dfinity/hardware-wallet-cli`
- Run the CLI: `ic-hardware-wallet --help`

## Development

- Clone the repository.
- Run `mise install` to install the supported version of `npm`.
  - If you don't have mise install, you can install it with `curl https://mise.run | sh`
- Install dependencies with `npm install`.

To execute a command, you can use `just run <args>`. Example: `just run --help`

## USB connection issues with Ledger Live

In order to install the Internet Computer App on your Ledger device or perform
the genuine check, you need to first connect your Ledger device with the Ledger
Live desktop app running on your computer. If you are facing connection issues
when doing so, Ledger provides platform-specific
[troubleshooting instructions](https://support.ledger.com/hc/en-us/articles/115005165269-Fix-USB-connection-issues-with-Ledger-Live?support=true)
on their support site.
