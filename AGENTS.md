# Agent instructions for hiero-ledger/solo

This file orients AI coding agents (GitHub Copilot coding agent and compatible tools). Solo's
conventions are defined once and referenced here — do not duplicate them:

- **Project overview, commands, architecture, gotchas:** [`CLAUDE.md`](CLAUDE.md)
- **TypeScript style guide (authoritative):** [`docs/contributing/typescript-code-style.md`](docs/contributing/typescript-code-style.md)
- **Copilot-specific quick rules:** [`.github/copilot-instructions.md`](.github/copilot-instructions.md)
- **Enforced lint rules:** [`eslint.config.mjs`](eslint.config.mjs) — run `task format` before committing.

## Most-violated rules (read the style guide for the rest)

- **No exported functions.** Group behavior on a class as `static` methods; do not `export function`
  or `export const fn = () => …` at module scope. Pure data (constants, types) may be exported.
  Helpers used by one class become `private static` members. (§3.4.5, §10.3.1–§10.3.2; enforced by
  `solo/no-exported-function`.)
- **One exported class/interface per file**, file named in kebab-case matching it. (§3.5) Splitting
  interfaces into separate files can introduce **circular dependencies** — always verify with
  `npx dpdm --no-warning --no-tree --exit-code circular:1 ./solo.ts` after any such move.
- `import {type X}` (inline), explicit type annotations everywhere, no banned abbreviations, SPDX
  header on every source file.
