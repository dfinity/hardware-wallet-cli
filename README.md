# hardware-wallet-cli

A CLI to interact with the Internet Computer App on Ledger Nano S/X devices.

## Quick Start

- Install `node >= 18.13.0`.
- Install the CLI: `npm install -g @dfinity/hardware-wallet-cli`
- Run the CLI: `ic-hardware-wallet --help`

## USB connection issues with Ledger Live

In order to install the Internet Computer App on your Ledger device or perform
the genuine check, you need to first connect your Ledger device with the Ledger
Live desktop app running on your computer. If you are facing connection issues
when doing so, Ledger provides platform-specific
[troubleshooting instructions](https://support.ledger.com/hc/en-us/articles/115005165269-Fix-USB-connection-issues-with-Ledger-Live?support=true)
on their support site.

## Development

Clone the repository.

Install dependencies with `npm install`.

To execute a command, you can use `npm run execute -- <args>`.

For example

- The command `ic-hardware-wallet --network https://nnsdapp.dfinity.network icp balance`.
- Would be `npm run execute -- --network https://nnsdapp.dfinity.network icp balance` for development.
