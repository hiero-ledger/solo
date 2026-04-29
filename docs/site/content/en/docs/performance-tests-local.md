---
title: "Run Performance Tests Locally"
weight: 110
description: >
    How to run Solo E2E performance tests locally, including setup, execution, and optional local build path configuration.
type: docs
---

This guide shows how to run the E2E performance test on a local machine.

## Prerequisites

- `task`, `node`, `npm`, `kubectl`, and `kind` installed
- Docker running
- Solo dependencies installed (`npm ci`)

## Run The Performance Test

From the repository root:

```bash
task test-setup
task test-e2e-performance
```

The test uses `one-shot single` for deploy/destroy and then runs rapid-fire load tests.

## Optional: Use a Local Consensus Node Build

If you already have a local consensus node build, set `SOLO_LOCAL_BUILD_PATH` so commands that consume
`--local-build-path` can use it by default:

```bash
export SOLO_LOCAL_BUILD_PATH="/absolute/path/to/hiero-consensus-node/hedera-node/data"
task test-setup
task test-e2e-performance
```

## Optional: Shorten Test Duration

You can shorten the load-test duration while iterating:

```bash
export ONE_SHOT_METRICS_TEST_DURATION_IN_MINUTES=2
task test-e2e-performance
```

## Run The GitHub Performance Workflow For A Branch

You can run the repository performance workflow against any pushed Solo branch.

### Option 1: Using `gh` CLI

```bash
export SOLO_BRANCH="<your-branch-name>"
gh workflow run "Performance Test Solo Deployment" --ref "${SOLO_BRANCH}" --repo hiero-ledger/solo
```

Watch the latest run for that branch:

```bash
RUN_ID=$(gh run list --workflow "Performance Test Solo Deployment" --branch "${SOLO_BRANCH}" --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "${RUN_ID}" --repo hiero-ledger/solo
```

### Option 2: Using GitHub Web UI

1. Open `https://github.com/hiero-ledger/solo/actions/workflows/flow-performance-test.yaml`.
2. Click `Run workflow`.
3. Select your branch in the branch dropdown.
4. Click `Run workflow` to start the run.
