# One-Shot Interrupt Destroy Example

This example repeatedly starts a `one-shot single deploy`, interrupts it after a randomized delay, then runs `one-shot single destroy`. It is intended to validate that destroy flows are resilient against partially deployed components.

## Usage

From the repo root:

```bash
cd examples/one-shot-interrupt-destroy

task
```

Optional environment variables:

```bash
# Use released Solo instead of local source
USE_RELEASED_VERSION=true

# Override deployment name
SOLO_DEPLOYMENT=one-shot-interrupt

# Override time buckets (seconds)
INTERRUPT_SECONDS="60 90 120"

# Max jitter in seconds (applied +/-)
JITTER_SECONDS=10
```

## What it does

For each time bucket (1.0 min to 7.0 min, every 30s):

1. Starts `solo one-shot single deploy` in the background.
2. Waits for `base + random(-10..+10)` seconds.
3. Sends `SIGTERM` to the deploy process.
4. Runs `solo one-shot single destroy` with `--force`.

If you need to clean up manually:

```bash
cd examples/one-shot-interrupt-destroy

task destroy
```
