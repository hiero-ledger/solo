---
name: solo-log-ci-failure
description: Create a GitHub bug issue in hiero-ledger/solo for a failed CI workflow run — preserves the job log, solo.log, and diagnostics as a secret gist, extracts error context, and creates a fully-tagged P0 bug linked to the current quarter initiative.
license: MIT
metadata:
  author: Jeromy Cannon
  version: "1.3.0"
  domain: github
  triggers: log ci failure, ci failure issue, workflow failure, failed workflow run, solo-log-ci-failure
  role: developer
  scope: project-management
  output-format: url
---

# Solo Log CI Failure

Given a GitHub Actions workflow URL (run, run+job, or suite/logs), create a fully-configured P0
bug issue in `hiero-ledger/solo` with **permanently preserved** log files and complete project
metadata — in exactly **two user-approval Bash calls**.

GitHub artifacts auto-purge after 7 days. This skill downloads the key log files and uploads them
as a **secret gist** (never expires, not publicly listed, accessible by URL). The issue body links
directly to the gist.

> **Prerequisite:** the `gh` token must have the `gist` scope. Verify with `gh auth status`.
> If missing, run: `gh auth refresh -h github.com -s gist`

## Supported URL formats

| Format | Example |
|--------|---------|
| Run + job | `https://github.com/hiero-ledger/solo/actions/runs/30336845771/job/90203561367` |
| Run only | `https://github.com/hiero-ledger/solo/actions/runs/30336845771` |
| Suite/logs | `https://github.com/hiero-ledger/solo/suites/82215623504/logs?attempt=1` |

---

## Phase 1 — Gather (one read-only Bash call → one approval prompt)

```bash
set -euo pipefail
INPUT_URL="<user-provided URL>"

# ── Parse IDs from URL ────────────────────────────────────────────────────────
RUN_ID=$(echo "$INPUT_URL"   | grep -oE 'runs/[0-9]+'   | head -1 | cut -d/ -f2 || echo "")
JOB_ID=$(echo "$INPUT_URL"   | grep -oE 'job/[0-9]+'    | head -1 | cut -d/ -f2 || echo "")
SUITE_ID=$(echo "$INPUT_URL" | grep -oE 'suites/[0-9]+' | head -1 | cut -d/ -f2 || echo "")

# ── Resolve suite → run if needed ────────────────────────────────────────────
if [[ -z "$RUN_ID" && -n "$SUITE_ID" ]]; then
  RUN_ID=$(gh api "repos/hiero-ledger/solo/check-suites/${SUITE_ID}/check-runs" \
    --jq '.check_runs[0].details_url' 2>/dev/null \
    | grep -oE 'runs/[0-9]+' | head -1 | cut -d/ -f2 || echo "")
  if [[ -z "$RUN_ID" ]]; then
    HEAD_SHA=$(gh api "repos/hiero-ledger/solo/check-suites/${SUITE_ID}" --jq '.head_sha')
    RUN_ID=$(gh api "repos/hiero-ledger/solo/actions/runs?head_sha=${HEAD_SHA}&per_page=10" \
      --jq '.workflow_runs[0].id' 2>/dev/null || echo "")
  fi
fi
echo "RUN_ID=${RUN_ID}  JOB_ID=${JOB_ID}"

# ── Run metadata ──────────────────────────────────────────────────────────────
echo "=== RUN INFO ==="
gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}" \
  --jq '{name: .name, run_number: .run_number, head_branch: .head_branch,
         html_url: .html_url, attempt: .run_attempt}'

# ── Job info ──────────────────────────────────────────────────────────────────
echo "=== JOB INFO ==="
if [[ -n "$JOB_ID" ]]; then
  gh api "repos/hiero-ledger/solo/actions/jobs/${JOB_ID}" \
    --jq '{id: .id, name: .name, conclusion: .conclusion, html_url: .html_url}'
else
  gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}/jobs?per_page=100" \
    --jq '[.jobs[] | select(.conclusion == "failure")] | first |
          {id: .id, name: .name, conclusion: .conclusion, html_url: .html_url}'
fi

# ── Artifacts ─────────────────────────────────────────────────────────────────
echo "=== ARTIFACTS ==="
gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}/artifacts" \
  --jq '.artifacts[] | {id: .id, name: .name, size_in_bytes: .size_in_bytes, expired: .expired}' \
  2>/dev/null || echo "(none)"

# ── Failed step logs ──────────────────────────────────────────────────────────
echo "=== FAILED STEP LOGS ==="
gh run view "${RUN_ID}" --repo hiero-ledger/solo --log-failed 2>/dev/null | head -500 \
  || echo "(not available via --log-failed; full log fetched in phase 3)"
```

If `JOB_ID` was absent, note the `.id` from JOB INFO and carry it forward as `JOB_ID`.

---

## Phase 1 → synthesis

From the output extract:

| Field | Source |
|-------|--------|
| Job name | JOB INFO `.name` |
| SOLO error box | `╭─ ERROR ─…╮ … ╰─…╯` block in logs |
| SOLO error code | `[SOLO-NNNN]` inside error box |
| Failed command | Line after `Current Command\s*:` |
| Deployment diagnostics | Block starting `1. ERROR detected in solo.log` |
| Branch | RUN INFO `.head_branch` |
| Run number / URL | RUN INFO `.run_number` / `.html_url` |
| Attempt | RUN INFO `.attempt` |
| Job URL | JOB INFO `.html_url` |
| Matching artifact | Find `solo-logs-*` entry in ARTIFACTS whose name matches the job |

### Artifact name convention

CI jobs upload artifacts named `solo-logs-{test-slug}`:

| Job name contains | Artifact name |
|-------------------|---------------|
| `version upgrade` | `solo-logs-version-upgrade-test` |
| `ledger reset` | `solo-logs-ledger-reset-smoke` |
| `rapid fire` | `solo-logs-rapid-fire` |
| *(other)* | pick the `solo-logs-*` artifact closest to the job name |

---

## Phase 3 — Download, preserve, create issue (one write Bash call → one approval prompt)

This single script does everything with write access:
1. Downloads the full job log text
2. Downloads the matching `solo-logs-*` artifact and extracts key text log files
3. Creates a **secret gist** with all log files (persists indefinitely)
4. Creates the GitHub issue with the gist URL embedded
5. Configures both projects and sets the sub-issue relationship

Fill in all `<…>` placeholders from synthesis, then run as one Bash call.

```bash
set -euo pipefail

# ── Inputs ────────────────────────────────────────────────────────────────────
RUN_ID="<run id>"
JOB_ID="<job id, resolved>"
JOB_NAME="<job name, e.g. Test Example (Version Upgrade Test)>"
ARTIFACT_NAME="<e.g. solo-logs-version-upgrade-test>"
PARENT_ISSUE_ID="I_kwDOLMTWdc8AAAABIo7dFw"   # change if a different initiative fits better

SCRATCH="/private/tmp/claude-502/-Users-user-source-solo/4740bb8b-8e79-49c6-9d20-27865a084930/scratchpad/ci-${RUN_ID}"
mkdir -p "${SCRATCH}/artifact-dl"

# ════════════════════════════════════════════════════════════════════════════════
# 1. Download job log
# ════════════════════════════════════════════════════════════════════════════════
JOB_LOG_PATH="${SCRATCH}/job-${JOB_ID}.log"
echo "Downloading job log..."
gh api "repos/hiero-ledger/solo/actions/jobs/${JOB_ID}/logs" \
  > "$JOB_LOG_PATH" 2>/dev/null \
  && echo "  $(wc -l < "$JOB_LOG_PATH") lines" \
  || { echo "  unavailable"; echo "(job log unavailable)" > "$JOB_LOG_PATH"; }

# ════════════════════════════════════════════════════════════════════════════════
# 2. Download artifact; stage ALL non-binary files into a flat gist directory
#    Directory separators are encoded as __ so every file gets a unique name.
#    Binary .zip files inside the artifact are skipped (gists are text-only).
# ════════════════════════════════════════════════════════════════════════════════
ARTIFACT_DIR="${SCRATCH}/artifact-dl"
echo "Downloading artifact ${ARTIFACT_NAME}..."
gh run download "${RUN_ID}" --repo hiero-ledger/solo \
  --name "${ARTIFACT_NAME}" --dir "$ARTIFACT_DIR/" 2>/dev/null \
  && echo "  downloaded" || echo "  not found or expired — continuing without it"

STAGE_DIR="${SCRATCH}/gist-stage"
rm -rf "$STAGE_DIR" && mkdir -p "$STAGE_DIR"

# Stage job log first (top-level, no encoding needed)
cp "$JOB_LOG_PATH" "${STAGE_DIR}/"

# Stage every non-binary artifact file with path-encoded name
while IFS= read -r -d '' f; do
  REL="${f#${ARTIFACT_DIR}/}"           # e.g. hiero-components-logs/cluster/foo.log
  FLAT="${REL//\//__}"                   # e.g. hiero-components-logs__cluster__foo.log
  SIZE=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
  (( SIZE < 10485760 )) && cp "$f" "${STAGE_DIR}/${FLAT}"
done < <(find "$ARTIFACT_DIR" -type f ! -name "*.zip" -print0 2>/dev/null)

GIST_FILES=("${STAGE_DIR}"/*)
echo "  ${#GIST_FILES[@]} file(s) staged for gist"

# ════════════════════════════════════════════════════════════════════════════════
# 3. Create secret gist  (secret = default; no flag needed)
#    GH_TOKEN env var often lacks the gist scope; unset it so gh falls back to
#    the keyring token which has the full scope set.
# ════════════════════════════════════════════════════════════════════════════════
echo "Creating secret gist..."
GIST_URL=$(env -u GH_TOKEN gh gist create \
  --desc "Solo CI failure logs — run ${RUN_ID} job ${JOB_ID} [${JOB_NAME}]" \
  "${GIST_FILES[@]}")
echo "  ${GIST_URL}"

# Build per-file hyperlinks for the issue body
GIST_ID=$(echo "$GIST_URL" | rev | cut -d/ -f1 | rev)
GIST_USER=$(echo "$GIST_URL" | sed 's|https://gist.github.com/||' | cut -d/ -f1)
RAW_BASE="https://gist.githubusercontent.com/${GIST_USER}/${GIST_ID}/raw"

FILE_LINKS=""
while IFS= read -r flat; do
  display="${flat//__//}"   # restore / from __ for readability
  FILE_LINKS+="- [${display}](${RAW_BASE}/${flat})"$'\n'
done < <(ls "${STAGE_DIR}" | sort)

FILE_COUNT=$(ls "${STAGE_DIR}" | wc -l | tr -d ' ')

# ════════════════════════════════════════════════════════════════════════════════
# 4. Build title + body
# ════════════════════════════════════════════════════════════════════════════════
TITLE="<synthesized — see Title format>"

BODY=$(cat <<BODY_EOF
<synthesized — see Body format; substitute GIST_URL where indicated>
BODY_EOF
)

# ════════════════════════════════════════════════════════════════════════════════
# 5. Create issue
# ════════════════════════════════════════════════════════════════════════════════
RESPONSE1=$(gh api graphql -f query="
mutation {
  createIssue(input: {
    repositoryId: \"R_kgDOLMTWdQ\"
    title: $(echo "$TITLE" | jq -Rs .)
    issueTypeId: \"IT_kwDOCq2Q984BY34w\"
    labelIds: [\"LA_kwDOLMTWdc8AAAABg4dJNg\", \"LA_kwDOLMTWdc8AAAABg4dJZQ\"]
    body: $(echo "$BODY" | jq -Rs .)
  }) {
    issue { number url id }
  }
}")
ISSUE_ID=$(echo "$RESPONSE1"  | jq -r '.data.createIssue.issue.id')
ISSUE_URL=$(echo "$RESPONSE1" | jq -r '.data.createIssue.issue.url')
echo "Issue: $ISSUE_URL"

# ════════════════════════════════════════════════════════════════════════════════
# 6. Add to Solo CLI Program Board → Ready / P0
# ════════════════════════════════════════════════════════════════════════════════
ITEM_BOARD=$(gh api graphql -f query="
mutation {
  addProjectV2ItemById(input: {
    projectId: \"PVT_kwDOCq2Q984BQs6I\"
    contentId: \"$ISSUE_ID\"
  }) { item { id } }
}" | jq -r '.data.addProjectV2ItemById.item.id')

gh api graphql -f query="
mutation {
  setStatus: updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwDOCq2Q984BQs6I\"
    itemId: \"$ITEM_BOARD\"
    fieldId: \"PVTSSF_lADOCq2Q984BQs6Izg-vs_E\"
    value: { singleSelectOptionId: \"61e4505c\" }
  }) { projectV2Item { id } }
  setPriority: updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwDOCq2Q984BQs6I\"
    itemId: \"$ITEM_BOARD\"
    fieldId: \"PVTSSF_lADOCq2Q984BQs6Izg-vtZ0\"
    value: { singleSelectOptionId: \"79628723\" }
  }) { projectV2Item { id } }
}" > /dev/null && echo "Board: Ready/P0"

# ════════════════════════════════════════════════════════════════════════════════
# 7. Add to Solo X Team → Ready / P0-🔥
# ════════════════════════════════════════════════════════════════════════════════
ITEM_TEAM=$(gh api graphql -f query="
mutation {
  addProjectV2ItemById(input: {
    projectId: \"PVT_kwDOCq2Q984A6EW6\"
    contentId: \"$ISSUE_ID\"
  }) { item { id } }
}" | jq -r '.data.addProjectV2ItemById.item.id')

gh api graphql -f query="
mutation {
  setStatus: updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwDOCq2Q984A6EW6\"
    itemId: \"$ITEM_TEAM\"
    fieldId: \"PVTSSF_lADOCq2Q984A6EW6zguwhjU\"
    value: { singleSelectOptionId: \"36d4dfb8\" }
  }) { projectV2Item { id } }
  setPriority: updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwDOCq2Q984A6EW6\"
    itemId: \"$ITEM_TEAM\"
    fieldId: \"PVTSSF_lADOCq2Q984A6EW6zguwhkA\"
    value: { singleSelectOptionId: \"95df2dcd\" }
  }) { projectV2Item { id } }
}" > /dev/null && echo "X Team: Ready/P0-🔥"

# ════════════════════════════════════════════════════════════════════════════════
# 8. Set as sub-issue of initiative
# ════════════════════════════════════════════════════════════════════════════════
gh api graphql -f query="
mutation {
  addSubIssue(input: {
    issueId: \"$PARENT_ISSUE_ID\"
    subIssueId: \"$ISSUE_ID\"
    replaceParent: false
  }) { issue { number } subIssue { number } }
}" > /dev/null && echo "Sub-issue of initiative set"

echo ""
echo "════════════════════════════════════════════════════════"
echo "Created:   $ISSUE_URL"
echo "Title:     $TITLE"
echo "Type:      Bug  |  Priority: P0-🔥  |  Status: Ready"
echo "Labels:    Bug, P0-🔥"
echo "Projects:  Solo CLI Program Board (Ready / P0), Solo X Team (Ready / P0-🔥)"
echo "Parent:    #5004 — Initiative: 2026 Q3 Address Developer Experience Issues"
echo "Logs:      $GIST_URL"
echo "════════════════════════════════════════════════════════"
```

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

- **Run**: [#{run_number}]({run_html_url}) (attempt {attempt})
- **Job**: [{job_name}]({job_html_url})
- **Branch**: `{head_branch}`

## Log Archives

- [CI Logs (secret gist)]({GIST_URL}) — {FILE_COUNT} files (job log + complete `{ARTIFACT_NAME}` artifact)

<details>
<summary>All files</summary>

{FILE_LINKS}
</details>
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
