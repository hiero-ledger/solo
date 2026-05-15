---
name: solo-pr-review
description: Review a Solo pull request the way the Solo Team reviews — enforce Solo's TypeScript style guide, DRY/SOLID, class-with-static-methods discipline, generic CLI flag descriptions, error-handling consistency (KubeApiResponse.throwError), backwards compatibility, default-storage-class style fallbacks, cross-platform (Windows) safety, user-experience-first defaults, and root-cause-over-workaround thinking. Use when the user asks to review a PR, a branch, a diff, or a file change set in the hiero-ledger/solo repo. Triggers on "review this PR", "PR review", "review the diff", "review my branch", "look at PR #N".
license: Apache-2.0
allowed-tools: Bash, Read, Grep, Glob, WebFetch
metadata:
  version: "0.1.0"
  domain: code-review
  scope: hiero-ledger/solo
  triggers: review PR, review this PR, PR review, review the diff, review my branch
  related-skills: code-reviewer, security-review, review
---

# Solo PR Review

Review pull requests in `hiero-ledger/solo` the way the Solo Team reviews them. This skill encodes the conventions enforced repeatedly across the project so reviews stay consistent whether they're authored by a human or generated here.

## When to use

- The user supplies a PR number, PR URL, branch name, commit range, or file list and asks for a review.
- The user asks "what would you flag in this change?", "review my branch", or similar.
- The user is the PR author preparing to push and wants a self-review pass.

Do **not** use for: greenfield architecture proposals (use `architecture-designer`), security-only audits (use `security-review`), or generic non-Solo TypeScript reviews (use `code-reviewer`).

## Required reading before reviewing

Open these before writing any feedback. They are the rulebook — the review must cite them when something is off.

| File | What it owns |
|---|---|
| `docs/contributing/typescript-code-style.md` | The full TS style guide (DRY/SOLID, naming, imports, types, etc.) |
| `CLAUDE.md` | Project-level conventions and gotchas (flags, env vars, etc.) |
| `eslint.config.mjs` | Enforced lint rules (errors, not warnings) |
| `.prettierrc.json` | Formatting (120 col, single quotes, etc.) |

## Core workflow

1. **Establish intent.** Read the PR description (and any linked issue) and state the goal in one sentence. If the goal is unclear, stop and ask the author — do not guess.
2. **Inventory the diff.** List every file changed and group them: source, tests, workflows, docs, examples, generated. Note the size of each group. Big diffs that touch many groups warrant a structural pass before a line pass.
3. **Structural pass.** Walk the checklist in `references/solo-review-checklist.md`. This catches the recurring issues (DRY violations, exported functions, generic-flag wording, error-handling drift, missing Windows support, etc.) before getting into line-by-line nits.
4. **Line pass.** Read the actual diff. For each finding, decide:
   - **Critical** — bug, security issue, data loss, broken backwards compatibility, build/CI break.
   - **Major** — design/architecture issue, DRY/SOLID violation, missing default behavior, cross-platform regression, drift from existing patterns.
   - **Minor** — naming, comment hygiene, suggestion-block one-liners.
   - **Question** — something that looks off but might have a reason. Ask before claiming.
5. **Test pass.** Are there tests? Are they unit (cheap, fast) or did the author reach for E2E/nightly when a unit test would do? Flag missing unit coverage explicitly.
6. **Companion-repo check.** Does the PR touch behavior that needs a matching `solo-docs` or `solo-containers` change? If yes, ask if a linked PR exists.
7. **Write the report.** Use the template in §Output. Lead with the critical/major findings; line-level suggestion blocks come after.

> **Checkpoint:** before delivering the report, re-read it and ask: *"If I were the author, would I be able to act on every comment without another round-trip?"* If not, tighten the wording or add a code example.

## Reference guide

Load these on demand — don't paste them into the report.

| Topic | File                                               | Load when |
|---|----------------------------------------------------|---|
| Solo-specific review checklist | `references/solo-review-checklist.md`              | Always — this is the structural-pass driver |
| Feedback voice and format | `references/solo-maintainer-feedback-style.md` | Always — covers tone, suggestion blocks, root-cause questions |

## How to fetch the diff

```bash
# By PR number
gh pr view <number> --json title,body,headRefName,baseRefName,files,additions,deletions
gh pr diff <number>

# By branch (when working locally on the author's branch)
git diff origin/main...HEAD

# By file (for partial review)
git diff origin/main -- <path>
```

For URL-only inputs, parse the PR number out of the URL and use `gh pr view`/`gh pr diff`.

## Output template

```markdown
## Intent
<one-sentence recap of what the PR is trying to do>

## Verdict
<Approve | Request changes | Comment>

## Critical
- <issue> — `path/to/file.ts:LINE` — <why it blocks merge> <code example if useful>

## Major
- <issue> — `path/to/file.ts:LINE` — <why> <suggestion>

## Minor
- <issue> — `path/to/file.ts:LINE` — <suggestion>

## Questions for the author
- <question that needs an answer before this can be Approved>

## Positive
- <specific thing done well — be concrete, not generic>

## Companion work
- solo-docs PR: <linked / missing / N/A>
- solo-containers PR: <linked / missing / N/A>
```

Use GitHub suggestion blocks (` ```suggestion ` … ` ``` `) for any single-line or small-block edit — they let the author one-click apply.

## Constraints

### MUST
- Cite the rule being applied (style-guide section, eslint rule, or prior PR convention) for every Critical and Major finding.
- Prefer fixing existing methods over adding new ones when they overlap (DRY).
- Push back when a CLI flag description leaks command-specific context — flags belong to the whole CLI.
- Ask "is this a workaround?" whenever the change adds polling loops, sleep/wait, or `kubectl exec` of imperative shell sequences against application state.
- Flag any `.github/` script that isn't TypeScript or lacks an SPDX header.
- Flag any binding of `main` to an `alpha` / `rc` / `-snapshot` upstream version.

### MUST NOT
- Block on personal style preferences when a linter or formatter already enforces (or doesn't enforce) the choice.
- Repeat the same comment on every occurrence — leave one comment with "applies in N other places" and list them.
- Demand renames or refactors in files the PR didn't otherwise touch.
- Treat exported functions as automatically wrong if the codebase already uses them in that module — flag as Major and link the style-guide section, but acknowledge if there's a local pattern.
