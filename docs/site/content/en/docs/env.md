---
title: "Using Environment Variables"
weight: 120
description: >
    Environment variables are used to customize the behavior of Solo. This document provides a list of environment variables that can be configured to change the default behavior.
type: docs
---

## Feature flags

Feature flags are boolean switches that turn a piece of Solo behavior on or off without a code change.
They are declared on `FeatureFlagsSchema` (`src/data/schema/model/solo/feature-flags-schema.ts`) and read
through the layered configuration system, so every flag is settable from the environment.

### The flags

| Flag                           | What it does                                                                         | Default | Environment variables (highest precedence first)                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `copyWrapsLibraryInParallel`   | Copy the WRAPS library into consensus nodes concurrently rather than one at a time     | `false` | `SOLO_FEATURE-FLAGS_COPY-WRAPS-LIBRARY-IN-PARALLEL`, `EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL`                                  |
| `skipNodePing`                 | Skip the consensus node ping that guards node client reuse                             | `false` | `SOLO_FEATURE-FLAGS_SKIP-NODE-PING`, `SOLO_FF_SKIP_NODE_PING`, `SKIP_NODE_PING`                                                 |
| `disableImporterSpringProfiles` | Leave the mirror node importer pulling from the consensus node                        | `false` | `SOLO_FEATURE-FLAGS_DISABLE-IMPORTER-SPRING-PROFILES`, `SOLO_FF_DISABLE_IMPORTER_SPRING_PROFILES`, `DISABLE_IMPORTER_SPRING_PROFILES` |
| `enableImageCache`             | Cache container images locally. Opt-out — defaults on                                  | `true`  | `SOLO_FEATURE-FLAGS_ENABLE-IMAGE-CACHE`, `SOLO_FF_ENABLE_IMAGE_CACHE`, `ENABLE_IMAGE_CACHE`                                     |

Every legacy name in the right-hand column keeps working; it is now an alias for the flag rather than a
variable of its own. `copyWrapsLibInParallel` is still experimental, so it keeps only its `EXPERIMENTAL_`
name — it gains a `SOLO_FF_` one when it is promoted.

Two behaviours changed when these moved onto the flag mechanism:

* `SKIP_NODE_PING=false` now means "do not skip". It previously *skipped* the ping, because the old code
  used `Boolean('false')`, which is `true`.
* `ENABLE_IMAGE_CACHE` previously treated any value other than the exact string `false` as enabled, so
  `ENABLE_IMAGE_CACHE=0` meant on. It is now parsed as a boolean, so `0` means off.

### Naming

Each flag answers to up to three environment variable names. When more than one is set, the first match
in this list wins:

| Form                              | When to use it                                            | Example                                    |
| --------------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| `SOLO_FEATURE-FLAGS_<FLAG-NAME>`  | Generated from the property name; always available         | `SOLO_FEATURE-FLAGS_ONE-SHOT-RESUME=true`  |
| `SOLO_FF_<FLAG_NAME>`             | The readable alias for a standard flag                     | `SOLO_FF_ONE_SHOT_RESUME=true`             |
| `EXPERIMENTAL_<FLAG_NAME>`        | The alias for a flag that is still experimental            | `EXPERIMENTAL_ONE_SHOT_RESUME=true`        |

Note the hyphens in the generated form: they mark the camelCase word boundaries inside one property-name
segment, while `_` separates schema nesting levels. `SOLO_FEATURE_FLAGS_ONE_SHOT_RESUME` — all underscores —
is **not** the same key and will be ignored. The `SOLO_FF_*` and `EXPERIMENTAL_*` aliases exist precisely so
you rarely need to type the generated form.

Using an alias logs a notice naming the config key it resolved to.

A flag promoted from experimental to standard keeps its `EXPERIMENTAL_*` name as well as gaining a
`SOLO_FF_*` one, so existing scripts keep working.

### Values

Values are parsed as booleans: `true` and `false` mean what they say, and `0`/`1` work as well. Anything
else reads as `false`. Unlike some of the older ad-hoc toggles listed below, setting a flag to `false`
genuinely turns it off.

### Defaults and precedence

A flag's default comes from the `FeatureFlagsSchema` constructor. Precedence, lowest to highest:

1. The schema constructor default.
2. A value in a `resources/config/*.yaml` defaults file.
3. The environment variable.

## Configuration system environment variables

The same generated-name convention applies to every `@Expose()`d field on `SoloConfigSchema` and its nested
schemas, not just feature flags. Each camelCase property-name segment becomes `UPPER-KEBAB-CASE`, nesting
levels are joined with `_`, and the whole key is prefixed with `SOLO_`:

| Config property path           | Environment variable                  | Fixed alias                          |
| ------------------------------ | ------------------------------------- | ------------------------------------ |
| `helmChart.directory`          | `SOLO_HELM-CHART_DIRECTORY`           | —                                    |
| `tss.readyMaxAttempts`         | `SOLO_TSS_READY-MAX-ATTEMPTS`         | `SOLO_TSS_READY_MAX_ATTEMPTS`        |
| `tss.readyBackoffSeconds`      | `SOLO_TSS_READY-BACKOFF-SECONDS`      | `SOLO_TSS_READY_BACKOFF_SECONDS`     |
| `tss.timeoutAfterReadySeconds` | `SOLO_TSS_TIMEOUT-AFTER-READY-SECONDS` | `SOLO_TSS_TIMEOUT_AFTER_READY_SECONDS` |
| `tss.wraps.libraryDownloadUrl` | `SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL` | `SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL` |

## Other environment variables

These are read directly via `getEnvironmentVariable()` rather than through the configuration system.
`SOLO_SILENT_MODE` and `SOLO_DEV_OUTPUT` are deliberately not feature flags: both are read before the
dependency injection container exists, so they cannot come from the configuration system.

| Environment Variable | Description                                                         | Default Value   |
| -------------------- | --------------------------------------------------------------------- | --------------- |
| `SOLO_HOME`          | Path to the Solo cache and log files                                  | `~/.solo`       |
| `SOLO_CACHE_DIR`     | Path to the Solo cache directory                                      | `~/.solo/cache` |
| `SOLO_LOG_LEVEL`     | Logging level for Solo operations (trace, debug, info, warn, error)   | `info`          |
| `SOLO_SILENT_MODE`   | Suppress console output                                               | `false`         |
| `SOLO_DEV_OUTPUT`    | Treat all commands as if the `--debug` flag were specified            | `false`         |
