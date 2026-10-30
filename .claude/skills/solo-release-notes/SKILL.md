---
name: solo-release-notes
description: Write human-readable GitHub release notes for a published Solo release — gather the commits, PR descriptions, and diff signals (version.ts, CLI flags, command definitions, config schema migrations, env vars) between the release tag and the previous tag, then write an Overview, Breaking Changes, Upgrade Notes, What's New, Notable Fixes, and Component Versions summary, and prepend it to the semantic-release changelog on the GitHub release (idempotent, re-runnable). Use when the user asks to "write the release notes", "update the release description", "describe what's new in vX.Y.Z", "add a summary to the release", or "check a release for breaking changes".
license: Apache-2.0
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
metadata:
  version: "0.2.0"
  domain: release-management
  scope: hiero-ledger/solo
  triggers: release notes, release description, what's new, breaking changes in release, update github release, describe release
  related-skills: solo-prepare-release, solo-test-release
---

# Solo Release Notes

semantic-release publishes every Solo GitHub release with an auto-generated list of `feat:`/`fix:` commit subjects.
That list is complete but unreadable for users: CI and test fixes sit next to user-facing ones, reverted features
still appear, and breaking changes that were not marked `!` are invisible. This skill writes a curated summary for
**Solo users** and places it above the untouched auto-generated changelog.

Run from the `solo/` repo root (verify with `git rev-parse --show-toplevel`). The helper script lives next to this
file: `.claude/skills/solo-release-notes/release-notes.sh`.

## When to use

- After the release workflow (`flow-deploy-release-artifact.yaml`) has published a release — the GitHub release
  for the tag must already exist.
- To re-generate or refresh the summary of an existing release (the script strips the previous summary first).

Do **not** use for: preparing the release PR / README table (`solo-prepare-release`), smoke-testing a release
candidate (`solo-test-release`), or tagging/publishing (that is the workflow).

## Step 1 — Gather

```bash
SKILL_DIR=.claude/skills/solo-release-notes
bash "${SKILL_DIR}/release-notes.sh" gather <tag|latest> --out "<scratchpad>/release-notes-<tag>"
```

- `<tag>` defaults to what the user named; use `latest` if they did not name one.
- The previous tag is the nearest tag reachable from `<tag>^` (correct for both `main` and `release/N.N`
  maintenance lines). Pass `--previous <tag>` only if the user asks for a different range.
- Output directory contents:

| File | Content |
|------|---------|
| `changelog.md` | Current release body (semantic-release changelog), with any earlier generated summary removed |
| `commits.tsv` | `sha <TAB> PR number <TAB> subject` for every commit in range (release bot commit excluded) |
| `declared-breaking.tsv` | Commits with `type!:` or a `BREAKING CHANGE` footer |
| `prs.json` | Per PR: title, labels, files, author, `noBreakingChangesChecked`, `touchesProductCode`, description (PR template boilerplate removed) |
| `signals.md` | Filtered diffs of `version.ts`, `package.json`, flag names/defaults, command definitions, new schema migrations, removed command files, `env.md` entries |

Read `signals.md`, `declared-breaking.tsv`, and `prs.json` in full. Use `jq` to slice `prs.json` if it is large.

## Step 2 — Classify every PR

Assign each PR exactly one bucket. The `touchesProductCode` flag is only a hint (true if any file is under `src/`,
`version.ts`, `package.json`, `resources/`, `solo.ts`, `installers/`, or is `scripts/postinstall.mjs`); decide from the title, description, and file list.

| Bucket | Goes in | Typical examples |
|--------|---------|------------------|
| **Breaking** | Breaking Changes | removed/renamed command, subcommand or flag; changed flag default that alters behaviour; removed env var; raised Node.js / Kubernetes minimum; required manual migration |
| **Upgrade note** | Upgrade Notes | automatic but one-way change (new remote/local config schema version — older Solo CLIs can no longer read the deployment); behaviour change users should know about but need not act on (e.g. installers no longer pre-pull images); env var no longer read whose old effect is now the default |
| **Feature** | What's New | `feat:` that changes what a user can do with the CLI, charts, or installers |
| **User-facing fix** | Notable Fixes | `fix:`/`perf:` in product code whose symptom a user could have hit |
| **Dependency** | Component Versions | default component version bumps in `version.ts` (consensus node, mirror node, block node, relay, explorer, solo charts…) |
| **Internal** | omitted (counted only) | `ci:`, `test:`, `build:`, `chore(deps)` for docs site/examples/actions, `refactor:` with no behaviour change, fixes that only touch `test/`, `.github/`, `scripts/`, CI-only code paths, design docs |

Rules:

- **Net out reverts — against the source, not the titles.** A PR titled `Revert "<title>"` may be a partial revert
  or a rework. Check what exists at `<tag>` (`git grep <flag|env var|symbol> <tag> -- src`): if nothing of the
  original survives, drop both PRs; otherwise describe only the final state and cite both PRs.
- A `fix:` that only touches tests or CI is Internal even though semantic-release lists it under Bug Fixes.
- A `feat:` that only affects CI (e.g. image cache export for workflows) is Internal.
- Merge PRs that deliver one user-visible outcome into a single bullet citing all of them.

## Step 3 — Hunt for breaking changes

Do not rely on commit markers alone — in Solo they are rarely used. For every candidate below, **open the actual
diff** (`git diff <previous> <tag> -- <path>` or `gh pr diff <n> --repo hiero-ledger/solo`) and confirm before
listing it.

1. `declared-breaking.tsv` — always breaking unless the diff shows otherwise.
2. PRs with `noBreakingChangesChecked: false` that touch product code — read the description, especially the
   "not tested", "Known limitations", and "Existing deployments" sections, which often contain the real caveat
   (e.g. "the schema upgrade is one-way", "not remembered: pass it again on every upgrade").
3. `signals.md`:
   - **Flags:** a removed `name: '…'` line with no matching re-add = removed flag (breaking). A changed
     `defaultValue` = behaviour change (breaking if users must pass a flag to keep the old behaviour; otherwise an
     upgrade note). A new flag is a feature if its default keeps the previous behaviour — confirm in the PR
     description or the code that consumes it — and an upgrade note if it does not.
   - **Command definitions:** removed/renamed command, subcommand, or operation = breaking.
   - **Schema migrations:** each new `remote-config-vN-migration.ts` / local config migration = upgrade note:
     "deployments are migrated automatically on first use; Solo CLIs older than this release can no longer manage
     them".
   - **Removed files under `src/commands`:** check what command they backed.
   - **`env.md`:** removed variables = breaking; new variables = feature (if user-facing).
   - **`package.json` engines** raised = breaking. Runtime dependency changes are not user-facing unless they
     change behaviour.
   - **`version.ts`:** a consensus node minor bump is normal; mention it under Component Versions. A
     `KUBECTL_VERSION` bump raises the documented minimum Kubernetes version → upgrade note.

If nothing qualifies, leave the Breaking Changes section out entirely — no heading and no "none" line.

## Step 4 — Write the summary

Write `<out>/summary.md` with the Write tool, using this structure. Overview is always present; omit every other
section, Breaking Changes included, when it would be empty.

```markdown
## Overview

<2–4 sentences: the theme of the release and the one or two things users will care about most.>

## ⚠️ Breaking Changes

- **<What changed>** — <who is affected> <what they must do, with the exact command/flag>. (#1234)

## Upgrade Notes

- <one-way migrations, behaviour changes, new minimums>. (#1234)

## What's New

### <Theme, e.g. Mirror Node>

- **<Capability>** — <what users can now do and why it matters>. <Example: `solo mirror node add --mirror-node-source block-node`>. (#1234)

## Notable Fixes

- <Symptom users saw, phrased as now-fixed behaviour>. (#1234, #1240)

## Component Versions

| Component      | Previous | This release |
| -------------- | -------- | ------------ |
| Consensus Node | v0.77.2  | v0.78.1      |

<N internal changes (CI, tests, refactoring, tooling) are not listed above; see the full changelog below.>
```

Writing rules:

- **Audience is Solo users** (developers and CI operators running networks), not Solo maintainers. Describe
  outcomes, not class names — "remote config now records the ledger shard and realm", not "adds `LedgerSchema`".
- **Every bullet cites at least one PR number** as `(#1234)`; GitHub links them automatically. Never describe
  anything not grounded in a PR description or diff — if unsure what a PR does, read its diff.
- Use exact command, flag, and env var names in backticks, verified against the source at `<tag>`
  (`git show <tag>:src/commands/flags.ts`). Use the current command structure (e.g. `solo consensus network deploy`),
  checked against `src/commands/command-definitions/`.
- Present tense, active voice, one sentence per bullet where possible. No marketing language, no emoji other than
  the ⚠️ heading.
- Group What's New by component (Consensus Node, Mirror Node, Block Node, Relay, Explorer, One-Shot, Installers,
  Configuration…) only when there are 4+ features; otherwise a flat list.
- Notable Fixes: at most ~10 bullets; prefer fixes to deploy/upgrade failures, data loss, and platform support.
- Component Versions: only components whose default changed in `version.ts`; use non-`EDGE` constants.
- Compute the internal-change count, don't estimate it: `jq length prs.json` minus the number of distinct PR
  numbers cited in the summary (`grep -oE '#[0-9]{4,}' summary.md | sort -u | wc -l`).
- Do not repeat the full changelog and do not add a "Full Changelog" heading — the script adds it.

## Step 5 — Assemble

```bash
bash "${SKILL_DIR}/release-notes.sh" assemble "<out>" "<out>/summary.md"
```

This writes `<out>/final-notes.md`: the summary inside `<!-- solo-release-notes:start/end -->` markers, then the
original semantic-release changelog unchanged.

## Step 6 — Print the notes and ask for edits

Print the **full summary verbatim** to the console as rendered markdown — every section exactly as it will be
published, not a paraphrase or an excerpt. Leave out the semantic-release changelog below it (it is unchanged); say
that it follows under `## Full Changelog`.

After the notes, list separately so the user can judge the calls you made:

- each breaking change / upgrade note with the evidence you used (diff path or PR quote),
- PRs you excluded as Internal that touch product code, so they can override the call,
- reverted PRs you netted out or merged into a final-state bullet.

Then ask the user whether they want any edits, and **end the turn** to wait for the answer. Edits are free-form, so
ask in plain text rather than with a multiple-choice question.

When the user asks for edits:

1. Ground every new or changed claim the same way as in Step 4 — read the PR description, diff, or upstream source;
   say so if something they asked for cannot be verified.
2. Apply the change to `<out>/summary.md` (Edit tool) and re-run `assemble`.
3. Print the changed bullets/sections and ask again whether there are more edits.

Repeat until the user says there are no more edits. Never treat an edit request, or "looks good", as approval to
publish.

## Step 7 — Final confirmation, then publish

Editing a release is outward-facing — it notifies watchers and is visible to every user. Once the edits are done,
ask one explicit final question with AskUserQuestion, naming the tag, e.g. "Publish these release notes to
v0.95.0?" with the options **Publish** and **Don't publish (keep the draft)**. Run `gh release edit` only on
**Publish**. If the user declines, stop and give the absolute path of `final-notes.md`.

Before editing, make sure nobody changed the release since `gather` ran, so their edits are not overwritten:

```bash
bash "${SKILL_DIR}/release-notes.sh" check "<out>"
```

If it reports `changed` (exit 2), tell the user, re-run `gather` + `assemble`, print the notes again, and ask for
confirmation again. Otherwise:

```bash
gh release edit "<tag>" --repo hiero-ledger/solo --notes-file "<out>/final-notes.md"
```

Then verify and report the release URL (a single trailing-newline difference from `final-notes.md` is expected):

```bash
gh release view "<tag>" --repo hiero-ledger/solo --json url,body --jq '.url, (.body | split("\n")[0:5] | join("\n"))'
```

## Constraints

### MUST

- Run `gather` against the published release; stop if `gh release view <tag>` fails (release not published yet).
- Confirm every breaking change and upgrade note against the actual diff.
- Cite PR numbers on every bullet; net out reverted PRs.
- Keep the semantic-release changelog below the summary byte-for-byte (the `assemble` step guarantees this).
- Print the full summary and ask for edits before asking to publish; loop until the user has no more edits.
- Get a separate, explicit final confirmation (AskUserQuestion naming the tag) before `gh release edit`.

### MUST NOT

- Edit `CHANGELOG`/`README`/source files or create commits — this skill only edits the GitHub release body.
- Invent features, flags, or migration steps not present in the diff.
- List CI-only, test-only, or reverted changes as features or fixes.
- Use `gh release edit --notes "<text>"` with inline text (shell quoting mangles markdown); always `--notes-file`.
