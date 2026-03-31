# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Solo (`@hiero-ledger/solo`) is a CLI tool for deploying and managing private Hedera Networks on Kubernetes. It orchestrates consensus nodes, mirror nodes, block explorers, and JSON-RPC relays via Helm charts on Kind clusters.

- **Language:** TypeScript (ES2022, ESM)
- **Runtime:** Node.js >= 22.0.0
- **CLI Framework:** Yargs with Listr2 for task execution

## Common Commands

All task commands use [Task](https://taskfile.dev/) (`task`):

```bash
# Install dependencies
npm install

# Build (compile TypeScript + lint)
task build

# Compile only
task build:compile

# Run unit tests with coverage
task test

# Auto-fix lint/formatting issues (run before committing)
task format

# List all available tasks including E2E tests
task --list-all

# Run a specific E2E test suite
task test-e2e-integration
task test-e2e-standard

# Run solo via tsx (development mode, without building)
npm run solo-test -- <COMMAND> <ARGS>
```

To run a single unit test file directly:
```bash
npx mocha 'test/unit/path/to/test.ts'
```

Logs are written to `$HOME/.solo/logs/solo.log`. Tail with: `tail -f $HOME/.solo/logs/solo.log | jq`

## Architecture

The codebase follows a layered, command-driven architecture with dependency injection (`tsyringe-neo`):

**Entry point:** `solo.ts` → `ArgumentProcessor` (Yargs) → Command Layer

### Layer Overview

1. **`src/commands/`** — 14 CLI commands (account, deployment, network, node, cluster, block-node, explorer, mirror-node, relay, one-shot, backup-restore, rapid-fire, file). Each command extends `BaseCommand`. Command schemas are in `src/commands/command-definitions/`.

2. **`src/core/`** — ~95 services: `account-manager.ts`, `config-manager.ts`, `chart-manager.ts`, `key-manager.ts`, `lock/` (distributed leases), `logging/` (Pino), `dependency-managers/` (installs Helm, Kind, kubectl), `dependency-injection/` (service container + `InjectTokens`).

3. **`src/integration/`** — External system clients: `kubernetes/` (K8s API wrapper), `helm/` (Helm chart execution), `kind/` (cluster provisioning), `git/`, `npm/`.

4. **`src/business/`** — Runtime state, local/remote config providers, address book management, path/crypto utilities.

5. **`src/data/`** — Configuration schema (JSON schema validation + migrations), mapper (class↔object), storage backends.

### Key Patterns

- **Dependency Injection:** Services registered via `InjectTokens` enum; `@inject()` decorators on constructors. The DI container is initialized in `src/core/dependency-injection/`.
- **Task Execution:** All long-running operations are Listr2 task arrays, enabling progress rendering and cancellation.
- **Configuration:** Local (in-memory) and Remote (Kubernetes ConfigMap) config providers; validated against JSON schemas with migration support.
- **Error Hierarchy:** `SoloError` (base), `SilentBreak` (exit without display), specialized errors in `src/core/errors/`.
- **Component Versions:** Managed in `version.ts` at the repo root.

## Environment Variable Documentation

When adding, removing, or modifying environment variables consumed via `getEnvironmentVariable()` in `src/**/*.ts` or `version.ts`, update `docs/site/content/en/docs/env.md` to reflect the change. This does not apply to environment variables used only in the `test/` directory.

Each entry in `env.md` should include the variable name, a short description of its purpose, and its default value (as defined in the source).

## Coding Standards

Follow the project's TypeScript style guide at [`docs/contributing/typescript-code-style.md`](docs/contributing/typescript-code-style.md) for all code changes.

Before writing or modifying code, review these configuration files to avoid lint and formatting issues:

- **`.prettierrc.json`** — formatting rules (indentation, quotes, line length, etc.)
- **`eslint.config.mjs`** — linting rules and TypeScript-specific restrictions
- **`.remarkrc.mjs`** — Markdown linting rules (applies to `.md` files)

Run `task format` to auto-fix formatting and lint issues before committing.

## PR Requirements

- **DCO sign-off** on all commits (`git commit -s`)
- **Cryptographically signed commits** (GPG or SSH — must show "Verified" on GitHub)
- **Conventional Commit PR titles:** `feat:`, `fix:`, `docs:`, `chore:`, etc.
