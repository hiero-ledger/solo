---
name: solo-log-ci-failure
description: Create a GitHub bug issue in hiero-ledger/solo for a failed CI workflow run — preserves the job log, solo.log, and diagnostics as a secret gist, extracts error context, and creates a fully-tagged P0 bug linked to the current quarter initiative. Maximum two Bash calls per URL (Phase 1 + Phase 3), parallelised when multiple URLs are provided.
license: MIT
metadata:
  author: Jeromy Cannon
  version: "1.5.0"
  domain: github
  triggers: log ci failure, ci failure issue, workflow failure, failed workflow run, solo-log-ci-failure
  role: developer
  scope: project-management
  output-format: url
---

# Solo Log CI Failure

Given one or more GitHub Actions workflow URLs (run, run+job, or suite/logs), create fully-configured
P0 bug issues in `hiero-ledger/solo` with **permanently preserved** log files and complete project
metadata — in exactly **two Bash calls per URL** (Phase 1 + Phase 3), run in parallel when multiple
URLs are provided.

All executable logic lives in two reviewable shell scripts in this skill directory:

| Script | Purpose |
|--------|---------|
| `phase1-gather.sh` | Fetch metadata, download job log + artifact, extract errors, write state file |
| `phase3-create.sh` | Stage gist, create issue + project entries, link sub-issue, clean up |

GitHub artifacts auto-purge after 7 days. The scripts download key log files and upload them as a
**secret gist** (never expires, not publicly listed). The issue body links directly to the gist.

> **Prerequisite:** the `gh` token must have the `gist` scope. Verify with `gh auth status`.
> If missing, run: `gh auth refresh -h github.com -s gist`

---

## Reducing permission prompts

The two scripts are the single point of review. Once you have read and approved their content, you
can allowlist them by exact path so Claude can run them without per-call prompts:

```
/update-config add to project allowlist:
  Bash(bash *solo-log-ci-failure/phase1-gather.sh *)
  Bash(bash *solo-log-ci-failure/phase3-create.sh *)
```

This allowlists only those specific named scripts — not `gh` broadly — so the scope of trust
matches exactly what was reviewed.

---

## Supported URL formats

| Format | Example |
|--------|---------|
| Run + job | `https://github.com/hiero-ledger/solo/actions/runs/30336845771/job/90203561367` |
| Run only | `https://github.com/hiero-ledger/solo/actions/runs/30336845771` |
| Suite/logs | `https://github.com/hiero-ledger/solo/suites/82215623504/logs?attempt=1` |

---

## Phase 1 — Gather (one Bash call per URL)

When multiple URLs are given, launch all Phase 1 calls **in parallel** in a single message.

```bash
bash ~/.claude/skills/solo-log-ci-failure/phase1-gather.sh "<workflow-url>"
```

The script prints structured terminal output and writes
`/tmp/solo-ci-<RUN_ID>/phase1-state.json` for Phase 3 to consume.

---

## Phase 1 → synthesis

> **STOP — do not make any additional Bash calls after Phase 1 completes.**
> All error content needed to write the issue title and body is in the terminal output.
> Read it directly and proceed to Phase 3.

Read these fields from the `=== SYNTHESIS CONTEXT ===` block at the end of Phase 1 output:

| Field | Key in SYNTHESIS CONTEXT |
|-------|--------------------------|
| Run ID, Job ID, Job name | `run_id`, `job_id`, `job_name` |
| Run number, Run URL, Attempt | `run_number`, `run_url`, `attempt` |
| Branch, Job URL, Artifact name | `head_branch`, `job_url`, `artifact_name` |

Read these fields from the earlier sections of Phase 1 output:

| Field | Source section |
|-------|----------------|
| SOLO error box (`╭─ ERROR ─╮ … ╰─…╯`) | `JOB LOG ERRORS` or `SOLO.LOG ERRORS` |
| SOLO error code (`[SOLO-NNNN]`) | inside error box |
| Failed command | `Current Command` line |
| Deployment diagnostics | `DIAGNOSTICS` section |

### Artifact name convention (reference only — Phase 1 auto-selects)

| Job name contains | Artifact name |
|-------------------|---------------|
| `version upgrade` | `solo-logs-version-upgrade-test` |
| `ledger reset` | `solo-logs-ledger-reset-smoke` |
| `rapid fire` | `solo-logs-rapid-fire` |
| `windows` / `one-shot` | `standard-runner-one-shot-windows-logs` |
| `integration` | `solo-test-e2e-integration.log` |
| *(other)* | auto-selected by Phase 1 scoring |

---

## Phase 3 — Preserve + create issue (one Bash call per URL)

When multiple URLs are given, launch all Phase 3 calls **in parallel** in a single message.

Fill in `SOLO_CI_TITLE` and `SOLO_CI_BODY` from synthesis, then run:

```bash
SOLO_CI_TITLE="<title — see Title format below>" \
SOLO_CI_BODY=$(cat <<'BODY_EOF'
<body markdown — see Body format below; omit the Log Archives section, the script adds it>
BODY_EOF
) \
bash ~/.claude/skills/solo-log-ci-failure/phase3-create.sh "<RUN_ID>" [<PARENT_ISSUE_ID>]
```

`PARENT_ISSUE_ID` is optional; defaults to the Q3 2026 Developer Experience initiative
(`I_kwDOLMTWdc8AAAABIo7dFw`). Override when the failure belongs to a different initiative.

The script:
1. Reuses job log + artifact downloaded in Phase 1 (re-downloads only on cache miss)
2. Creates a secret gist with all log files
3. **Automatically appends** the `## Log Archives` section to the body with the gist URL + file links
4. Creates the GitHub issue (Bug, P0-🔥)
5. Adds to both project boards at Ready/P0
6. Links as sub-issue of the initiative
7. Cleans up `/tmp/solo-ci-<RUN_ID>`

---

## Title format

```
{Job Name} > {concise error description}
```

- Include SOLO error code if present: `{Job Name} > [SOLO-NNNN] {description}`
- Keep under 120 characters
- Example: `Test Example (Version Upgrade Test) > [SOLO-3032] Mirror node upgrade target v0.152.0 older than deployed 0.156.0`

---

## Body format

Pass everything **except** the `## Log Archives` section — the script appends that automatically.

```markdown
## Failure Summary

<2–3 sentences: what failed, the command, and the outcome.>

## Error Details

​```
<full SOLO ╭─ ERROR ─╮ box; or describe the error if no box found>
​```

## Failed Command

​```
Current Command: <command text>
​```

## Deployment Diagnostics

<paste diagnostics block if present; omit section entirely if not found>

## Workflow Information

- **Run**: [#{run_number}]({run_url}) (attempt {attempt})
- **Job**: [{job_name}]({job_url})
- **Branch**: `{head_branch}`
```

---

## Pre-resolved IDs

| Name | ID |
|------|----|
| Repo `hiero-ledger/solo` | `R_kgDOLMTWdQ` |
| Issue type: Bug | `IT_kwDOCq2Q984BY34w` |
| Label: Bug | `LA_kwDOLMTWdc8AAAABg4dJNg` |
| Label: P0-🔥 | `LA_kwDOLMTWdc8AAAABg4dJZQ` |
| **Solo CLI Program Board** | `PVT_kwDOCq2Q984BQs6I` |
| &nbsp;&nbsp;Status field | `PVTSSF_lADOCq2Q984BQs6Izg-vs_E` |
| &nbsp;&nbsp;Status: Ready | `61e4505c` |
| &nbsp;&nbsp;Priority field | `PVTSSF_lADOCq2Q984BQs6Izg-vtZ0` |
| &nbsp;&nbsp;Priority: P0 | `79628723` |
| **Solo X Team** | `PVT_kwDOCq2Q984A6EW6` |
| &nbsp;&nbsp;Status field | `PVTSSF_lADOCq2Q984A6EW6zguwhjU` |
| &nbsp;&nbsp;Status: Ready | `36d4dfb8` |
| &nbsp;&nbsp;Priority field | `PVTSSF_lADOCq2Q984A6EW6zguwhkA` |
| &nbsp;&nbsp;Priority: P0-🔥 | `95df2dcd` |

## Current quarter initiative issues

Default to **#5004** for CI / test / developer tooling failures.

| Initiative | # | Node ID |
|-----------|---|---------|
| 2026 Q3 — Address Developer Experience Issues *(default for CI failures)* | 5004 | `I_kwDOLMTWdc8AAAABIo7dFw` |
| 2026 Q3 — Address User Experience Issues | 5002 | `I_kwDOLMTWdc8AAAABIoWEfQ` |
| 2026 Q3 — Technical Debt Reduction | 5018 | `I_kwDOLMTWdc8AAAABIqZ7jQ` |
