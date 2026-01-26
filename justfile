# Run CLI (builds first)
run *commands:
    pnpm run build --silent && node ./dist/index.mjs {{commands}}

# Alias for run
alias r := run
