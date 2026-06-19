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
  class/interface name (e.g. `class KubeValidation` → `kube-validation.ts`). (§3.5)
- **`import type`** — use the inline form `import {type Foo} from '...'`, never `import type {Foo}`.
- **Explicit types** on every variable declaration and every callback (including `it()`/`describe()`
  callbacks in tests). (§6.1)
- **No banned abbreviations** in identifiers or file names (`fn`, `vars`, `opts`, `err`, `cb`, …). Use
  full words (`function` → spell out the role, `options`, `error`, `callback`). (§5.1.2)
- **SPDX header** as the first line of every source file:
  `// SPDX-License-Identifier: Apache-2.0`.
- **Named exports only** — no default exports; no `export let`. (§3.4.1–§3.4.4)
- **`PathEx`, not `node:path`** for filesystem paths. (§3.3.5)
- **CLI flag descriptions stay generic** — a flag belongs to the whole CLI, so its description must
  not reference a single command or component. (§10.3.3)

When unsure, follow the existing pattern in the directory you are editing and defer to
`docs/contributing/typescript-code-style.md`.
