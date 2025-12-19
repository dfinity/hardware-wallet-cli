# Build the CLI
build:
    npm run build

# Run CLI (without rebuilding)
run *commands:
    node ./dist/index.mjs {{commands}}

# Build and run CLI
execute *commands:
    npm run build
    node ./dist/index.mjs {{commands}}

# Alias for run
alias r := run

# Alias for execute  
alias e := execute
