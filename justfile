# Run CLI (builds first)
run *commands:
    pnpm run build --silent && node ./dist/index.mjs {{commands}}

# Alias for run
alias r := run

# Build test canister WASM
build-test-canister:
    cargo build --manifest-path tests/test-canister/Cargo.toml --target wasm32-unknown-unknown --release
    cp tests/test-canister/target/wasm32-unknown-unknown/release/test_canister.wasm tests/test-canister/test_canister.wasm
