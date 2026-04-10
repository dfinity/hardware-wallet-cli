# Run CLI (builds first)
run *commands:
    pnpm run build --silent && node ./dist/index.mjs {{commands}}

# Alias for run
alias r := run

# Deploy test canister to local replica (run `icp network start -d` first)
local-deploy: build-icrc21-canister
    icp deploy

# Build ICRC-21 test canister WASM
build-icrc21-canister:
    mise exec -- cargo build --manifest-path tests/icrc21-canister/Cargo.toml --target wasm32-unknown-unknown --release
    cp tests/icrc21-canister/target/wasm32-unknown-unknown/release/icrc21_canister.wasm tests/icrc21-canister/icrc21_canister.wasm

test:
    pnpm test
