# GitHub Copilot instructions for hiero-ledger/solo

These instructions apply to all code suggestions in this repository. They mirror `CLAUDE.md` and the
full TypeScript style guide at `docs/contributing/typescript-code-style.md` — read that guide for the
authoritative rules and rationale. The conventions below are the ones violated most often.

## Highest-frequency rules

- **No exported functions.** Behavior (resolvers, orchestrators, computations) is grouped on a class
  as `static` methods. Do **not** write `export function foo(...)` or `export const foo = () => …` at
  module scope. Pure data — constants, types, simple factories — may still be exported. A helper used
  by only one class becomes a `private static` member of that class. (§3.4.5, §10.3.1–§10.3.2; enforced
  by the `solo/no-exported-function` ESLint rule — an error in `src/integration/**`.)

  ```ts
  // ❌ Avoid
  export function detectFatalContainerError(pod: V1Pod): string | undefined { ... }

  // ✅ Prefer
  export class K8ClientPods {
    public static detectFatalContainerError(pod: V1Pod): string | undefined { ... }
  }
  ```

- **One exported class/interface per file**, with the file named in kebab-case matching the
  class/interface name (e.g. `class KubeValidation` → `kube-validation.ts`,
  `interface FooBarOptions` → `foo-bar-options.ts`). (§3.5; enforced by `solo/exported-interface-in-own-file`
  lint rule for interfaces — a warning today, escalating to error once legacy barrel files are split)
  Splitting types into separate files can create **circular dependencies** — verify with
  `npx dpdm --no-warning --no-tree --exit-code circular:1 ./solo.ts` after any such move. Break
  cycles by extracting a minimal shared interface rather than having two files import each other.
- **`import type`** — use the inline form `import {type Foo} from '...'`, never `import type {Foo}`.
- **Explicit types** on every variable declaration and every callback (including `it()`/`describe()`
  callbacks in tests). (§6.1)
- **No banned abbreviations** in identifiers or file names (`fn`, `vars`, `opts`, `err`, `cb`, …). Use
  full words (`function` → spell out the role, `options`, `error`, `callback`). (§5.1.2)
- **SPDX header** required on every source file. TypeScript: `// SPDX-License-Identifier: Apache-2.0`
  as the very first line (enforced by ESLint). Shell scripts under `.github/workflows/script/`: add
  `# SPDX-License-Identifier: Apache-2.0` on the line immediately after `#!/bin/bash` — ESLint does
  not cover shell files, so apply it manually.

- **Environment variables — use `getEnvironmentVariable()`, never `process.env[...]`.**
  In `src/**/*.ts` (except `src/core/constants.ts`), always read application env vars through
  `getEnvironmentVariable('VAR_NAME')` exported from `src/core/constants.ts`. Bracket-notation reads
  (`process.env['VAR']` or `process.env[variable]`) are an ESLint **error** in `src/`. This is how
  the project tracks which env vars must be documented in `docs/site/content/en/docs/env.md`.
  Dot-access for OS-level vars (`process.env.PATH`, `process.env.HOME`) and spreading
  (`{...process.env}`) for subprocess env are fine and are not restricted.

  ```ts
  // ❌ Avoid
  const mirror: string = process.env['KIND_DOCKER_REGISTRY_MIRRORS'];
  const mirror: string = process.env[MY_CONSTANT];

  // ✅ Prefer
  import {getEnvironmentVariable} from '../core/constants.js';
  const mirror: string = getEnvironmentVariable('KIND_DOCKER_REGISTRY_MIRRORS');
  ```

- **`catch` blocks that swallow errors must explain why.** When a `catch` block does not re-throw
  (returns a default, returns `undefined`, or no-ops), include a comment stating what is being caught
  and why it is safe to ignore. §4.9 prohibits unexplained silent catches — a block is not
  "non-empty" just because it has a `return` statement; it also needs an explanation.

  ```ts
  // ❌ Avoid
  } catch {
    return [];
  }

  // ✅ Prefer
  } catch {
    // best-effort: fall back to empty list when kind-config is absent or unparseable
    return [];
  }
  ```

- **Named exports only** — no default exports; no `export let`. (§3.4.1–§3.4.4)
- **`PathEx`, not `node:path`** for filesystem paths. (§3.3.5)
- **CLI flag descriptions stay generic** — a flag belongs to the whole CLI, so its description must
  not reference a single command or component. (§10.3.3)

- **Remove dead code after every change.** When your edit makes a method, function, class, import,
  constant, or type alias unreachable or unreferenced, delete it in the same change. Do not leave
  orphaned code "for later" — git history preserves it if it is ever needed again.

- **Enhance existing abstractions before creating new ones.** Before adding a new method, function,
  or class, check whether an existing one can be extended or generalised to cover the new case.
  Only introduce a new abstraction when the existing one cannot cleanly accommodate the change
  without becoming misleading or overloaded.

- **Keep CLI architecture docs in sync with command-definition changes.**
  `docs/design/architecture/system/presentation_layer_cli_architecture.md` is the authoritative
  reference for the command/subcommand surface. Whenever a file in
  `src/commands/command-definitions/` is edited to add, remove, rename, or reorder a command
  group (subcommand) or leaf operation, update the following sections of that document in the
  **same commit**:
  - **"Final Vision" table** — each row is `<group> | <resource> | <operations>`.
  - **"Example Commands" block** — add/update example invocations when the CLI surface changes.
  - **"Resources by Group" and "Operations by Resource" sections** — add, remove, or rename
    matching headings and table rows.
  - **Table of Contents** — fix anchor links for any renamed headings.

When unsure, follow the existing pattern in the directory you are editing and defer to
`docs/contributing/typescript-code-style.md`.
