# Ledger Reset Smoke Test

This example validates the `ledger system reset` flow using Taskfile steps.

## What It Does

- Deploys a kind cluster and a minimal Solo deployment (consensus, mirror, explorer, block node).
- Creates an account with a specified balance and verifies it through the mirror REST API.
- Resets the ledger to genesis.
- Creates a new account with a different balance and verifies it through the mirror REST API.

## Prerequisites

- `kind`, `kubectl`, `npm`, `python3`
- `task` installed

## Run

```bash
task -d examples/ledger-reset-smoke
```

## Customize

Set any of these environment variables before running:

- `SOLO_CLUSTER_NAME`
- `SOLO_NAMESPACE`
- `SOLO_CLUSTER_SETUP_NAMESPACE`
- `SOLO_DEPLOYMENT`
- `NODE_ALIASES`
- `EXPECTED_BALANCE_1`
- `EXPECTED_BALANCE_2`
- `MIRROR_QUERY_RETRIES`
- `MIRROR_QUERY_SLEEP`
- `SOLO_HOME`

Example:

```bash
SOLO_NAMESPACE=solo-ledger-reset task -d examples/ledger-reset-smoke
```
