#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Solo CI Failure Logger
#
# Fetches CI failure data, extracts errors, creates a secret gist of all log
# files, and files a fully-tagged P0 Bug issue in hiero-ledger/solo.
#
# Usage:
#   bash log-ci-failure.sh <workflow-url> [<parent-issue-id>]
#
# Supported URL formats:
#   https://github.com/hiero-ledger/solo/actions/runs/<RUN_ID>/job/<JOB_ID>
#   https://github.com/hiero-ledger/solo/actions/runs/<RUN_ID>
#   https://github.com/hiero-ledger/solo/suites/<SUITE_ID>/logs?attempt=1
#
# Arguments:
#   workflow-url     Required.
#   parent-issue-id  Optional. Node ID of initiative issue to link as parent.
#                    Defaults to Q3 2026 Developer Experience (#5004).
#
# Requirements: gh (with repo + gist scopes), jq, bash 4+

set -euo pipefail

INPUT_URL="${1:?Usage: bash log-ci-failure.sh <workflow-url> [parent-issue-id]}"
PARENT_ISSUE_ID="${2:-I_kwDOLMTWdc8AAAABIo7dFw}"

# ── Parse IDs from URL ────────────────────────────────────────────────────────
RUN_ID=$(echo "$INPUT_URL" | grep -oE 'runs/[0-9]+'    | head -1 | cut -d/ -f2 || true)
JOB_ID=$(echo "$INPUT_URL" | grep -oE 'job/[0-9]+'     | head -1 | cut -d/ -f2 || true)
SUITE_ID=$(echo "$INPUT_URL" | grep -oE 'suites/[0-9]+' | head -1 | cut -d/ -f2 || true)

# Resolve suite → run
if [[ -z "${RUN_ID:-}" && -n "${SUITE_ID:-}" ]]; then
  RUN_ID=$(gh api "repos/hiero-ledger/solo/check-suites/${SUITE_ID}/check-runs" \
    --jq '.check_runs[0].details_url' 2>/dev/null \
    | grep -oE 'runs/[0-9]+' | head -1 | cut -d/ -f2 || true)
  if [[ -z "${RUN_ID:-}" ]]; then
    HEAD_SHA=$(gh api "repos/hiero-ledger/solo/check-suites/${SUITE_ID}" --jq '.head_sha')
    RUN_ID=$(gh api "repos/hiero-ledger/solo/actions/runs?head_sha=${HEAD_SHA}&per_page=10" \
      --jq '.workflow_runs[0].id' 2>/dev/null || true)
  fi
fi

[[ -z "${RUN_ID:-}" ]] && { echo "ERROR: could not parse RUN_ID from: ${INPUT_URL}"; exit 1; }
echo "run=${RUN_ID}  job=${JOB_ID:-<resolving>}"

# ── Scratch dir ───────────────────────────────────────────────────────────────
SCRATCH="/tmp/solo-ci-${RUN_ID}"
mkdir -p "${SCRATCH}/artifact"

# ── Run metadata ──────────────────────────────────────────────────────────────
echo "Fetching run metadata..."
RUN_META=$(gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}" \
  --jq '{name:.name,run_number:.run_number,head_branch:.head_branch,
         html_url:.html_url,attempt:.run_attempt}')
RUN_NUMBER=$(echo "$RUN_META"  | jq -r '.run_number')
RUN_URL=$(echo "$RUN_META"     | jq -r '.html_url')
RUN_ATTEMPT=$(echo "$RUN_META" | jq -r '.attempt')
HEAD_BRANCH=$(echo "$RUN_META" | jq -r '.head_branch')

# ── Job info ──────────────────────────────────────────────────────────────────
echo "Fetching job metadata..."
if [[ -n "${JOB_ID:-}" ]]; then
  JOB_META=$(gh api "repos/hiero-ledger/solo/actions/jobs/${JOB_ID}" \
    --jq '{id:.id,name:.name,conclusion:.conclusion,html_url:.html_url}')
else
  JOB_META=$(gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}/jobs?per_page=100" \
    --jq '[.jobs[]|select(.conclusion=="failure")]|first|
          {id:.id,name:.name,conclusion:.conclusion,html_url:.html_url}')
  JOB_ID=$(echo "$JOB_META" | jq -r '.id')
fi
JOB_NAME=$(echo "$JOB_META" | jq -r '.name')
JOB_URL=$(echo "$JOB_META"  | jq -r '.html_url')
# Short form: last segment after "/"
JOB_SHORT=$(echo "$JOB_NAME" | sed 's|.*/||')
echo "  job: ${JOB_NAME} (${JOB_ID})"

# ── Artifacts — list + auto-select best match ─────────────────────────────────
echo "Listing artifacts..."
ARTIFACTS_JSON=$(gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}/artifacts" 2>/dev/null \
  || echo '{"artifacts":[]}')

JOB_SLUG=$(echo "$JOB_NAME" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//;s/-$//')
ARTIFACT_NAME=$(echo "$ARTIFACTS_JSON" | jq -r --arg slug "$JOB_SLUG" '
  [.artifacts[]|select(.expired==false)]
  | map(. + {score:(
      [($slug|split("-")[]),(.name|split("-")[])]
      | group_by(.) | map(select(length>1)) | length
    )})
  | sort_by(-.score) | .[0].name // ""' 2>/dev/null || true)
[[ -z "${ARTIFACT_NAME:-}" ]] && \
  ARTIFACT_NAME=$(echo "$ARTIFACTS_JSON" | \
    jq -r '[.artifacts[]|select(.expired==false)|select(.name|test("log";"i"))]|.[0].name//"" ')
[[ -z "${ARTIFACT_NAME:-}" ]] && \
  ARTIFACT_NAME=$(echo "$ARTIFACTS_JSON" | \
    jq -r '[.artifacts[]|select(.expired==false)]|.[0].name//"" ')
echo "  artifact: ${ARTIFACT_NAME:-"(none)"}"

# ── Download job log ──────────────────────────────────────────────────────────
echo "Downloading job log..."
JOB_LOG_PATH="${SCRATCH}/job-${JOB_ID}.log"
# Never use `gh run view --log-failed` — it returns empty for matrix/integration jobs.
gh api "repos/hiero-ledger/solo/actions/jobs/${JOB_ID}/logs" 2>/dev/null \
  > "$JOB_LOG_PATH" \
  && echo "  $(wc -l < "$JOB_LOG_PATH") lines" \
  || { echo "  unavailable"; printf "(job log unavailable)\n" > "$JOB_LOG_PATH"; }

# ── Download artifact ─────────────────────────────────────────────────────────
ARTIFACT_DIR="${SCRATCH}/artifact"
if [[ -n "${ARTIFACT_NAME:-}" ]]; then
  echo "Downloading artifact: ${ARTIFACT_NAME}..."
  gh run download "${RUN_ID}" --repo hiero-ledger/solo \
    --name "${ARTIFACT_NAME}" --dir "${ARTIFACT_DIR}/" 2>/dev/null \
    && echo "  done" || echo "  not found or expired — continuing without it"
fi

SOLO_LOG="${ARTIFACT_DIR}/solo.log"
DIAG="${ARTIFACT_DIR}/hiero-components-logs/diagnostics-analysis.txt"

# ── Extract errors ────────────────────────────────────────────────────────────
echo "Extracting errors..."

JOB_ERRORS=$(grep -E "SOLO-[0-9]+|╭|╰|Current Command|##\[error\]|AssertionError|Timeout of [0-9]+ms|failed with error|exit status [1-9][0-9]*" \
  "$JOB_LOG_PATH" 2>/dev/null \
  | grep -v "timeout_minutes\|continue_on_error\|shell:\|DOCKER_HOST\|STEP_TIMEOUT\|warn deprecated" \
  | head -50 || true)

SOLO_ERRORS=""
[[ -f "$SOLO_LOG" ]] && SOLO_ERRORS=$(grep -E "ERROR|SOLO-[0-9]+|Current Command" "$SOLO_LOG" 2>/dev/null | head -40 || true)

DIAG_TEXT=""
[[ -f "$DIAG" ]] && DIAG_TEXT=$(cat "$DIAG")

# ── Auto-generate issue title ─────────────────────────────────────────────────
# Priority: SOLO code → first meaningful ERROR: line → ##[error] → fallback

# "Error: Executing command: /path/cmd --flags url dest" → "cmd url"
# Prefers a URL-like token (contains dot-slash, e.g. "quay.io/") over generic flag values.
extract_cmd_summary() {
  local rest
  rest=$(echo "$1" | sed 's|.*Executing command: [^ ]*/||')
  local url_tok
  url_tok=$(echo "$rest" | tr ' ' '\n' | grep -E '[a-zA-Z0-9][.][a-zA-Z0-9]+/' | head -1 || true)
  if [[ -n "${url_tok:-}" ]]; then
    echo "$(echo "$rest" | awk '{print $1}') ${url_tok}"
  else
    echo "$rest" | awk '{print $1}'
  fi
}

# Remove GitHub log prefixes/ANSI noise and extract the most informative
# exception stack block from a log.
extract_exception_stack() {
  local log_path="$1"
  [[ -f "${log_path}" ]] || return 0

  awk '
function clean_line(value, cleaned) {
  cleaned = value
  gsub(/\r/, "", cleaned)
  sub(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z[[:space:]]+/, "", cleaned)
  gsub(/\033\[[0-9;]*[[:alpha:]]/, "", cleaned)
  return cleaned
}

function flush_block() {
  if (current_stack != "") {
    if ((current_frames > best_frames) || (current_frames == best_frames && length(current_stack) > length(best_stack))) {
      best_stack = current_stack
      best_frames = current_frames
    }
  }
  current_stack = ""
  current_frames = 0
  in_stack = 0
}

BEGIN {
  in_stack = 0
  current_frames = 0
  best_frames = -1
  current_stack = ""
  best_stack = ""
}

{
  line = clean_line($0)

  if (line ~ /^[[:space:]]*[A-Za-z0-9_.-]*(Error|Exception|SoloError):[[:space:]]+/) {
    flush_block()
    in_stack = 1
    current_stack = line ORS
    next
  }

  if (in_stack && line ~ /^[[:space:]]*Caused by:[[:space:]]+/) {
    current_stack = current_stack line ORS
    next
  }

  if (in_stack && line ~ /^[[:space:]]+at[[:space:]]+/) {
    current_stack = current_stack line ORS
    current_frames++
    next
  }

  if (in_stack && line ~ /^[[:space:]]*$/) {
    # Preserve blank spacing within stack traces without over-capturing.
    current_stack = current_stack line ORS
    next
  }

  if (in_stack) {
    flush_block()
  }
}

END {
  flush_block()
  printf "%s", best_stack
}
' "${log_path}" | sed '/^[[:space:]]*$/N;/^\n$/D'
}

LOG_FILES=("$JOB_LOG_PATH")
[[ -f "$SOLO_LOG" ]] && LOG_FILES+=("$SOLO_LOG")

STACK_TRACE=$(extract_exception_stack "$JOB_LOG_PATH" || true)
[[ -z "${STACK_TRACE:-}" && -f "$SOLO_LOG" ]] && STACK_TRACE=$(extract_exception_stack "$SOLO_LOG" || true)

STACK_FIRST_LINE=$(echo "${STACK_TRACE:-}" | grep -m1 -E '^[[:space:]]*[A-Za-z0-9_.-]*(Error|Exception|SoloError):[[:space:]]+' || true)

SOLO_CODE=$(grep -oE 'SOLO-[0-9]+' "${LOG_FILES[@]}" 2>/dev/null | head -1 | grep -oE 'SOLO-[0-9]+' || true)

if [[ -n "${SOLO_CODE:-}" ]]; then
  SOLO_MSG=$(grep -A2 "$SOLO_CODE" "$SOLO_LOG" 2>/dev/null \
    | grep "ERROR:" | head -1 | sed 's/.*ERROR: //' | cut -c1-80 || true)
  ERROR_DESC="[${SOLO_CODE}]${SOLO_MSG:+ ${SOLO_MSG}}"
else
  # Skip generic "Error executing: 'podman' {" / "Error executing: 'sudo' {" lines
  FIRST_SOLO_ERROR=$(grep "ERROR:" "$SOLO_LOG" 2>/dev/null \
    | grep -v "Error executing: '" \
    | head -1 | sed 's/.*\] ERROR: //' | sed 's/.*ERROR: //' || true)

  if [[ -n "${FIRST_SOLO_ERROR:-}" ]]; then
    if echo "$FIRST_SOLO_ERROR" | grep -q "Executing command:"; then
      ERROR_DESC=$(extract_cmd_summary "$FIRST_SOLO_ERROR")
    else
      ERROR_DESC=$(echo "$FIRST_SOLO_ERROR" | cut -c1-90)
    fi
  elif [[ -n "${STACK_FIRST_LINE:-}" ]]; then
    STACK_HEADLINE=$(echo "$STACK_FIRST_LINE" | sed -E 's/^[[:space:]]+//' | tr -s ' ')
    ERROR_DESC=$(echo "$STACK_HEADLINE" | cut -c1-90)
  else
    JOB_ERR_LINE=$(grep "##\[error\]" "$JOB_LOG_PATH" 2>/dev/null \
      | head -1 | sed 's/.*##\[error\]//' | cut -c1-90 || true)
    ERROR_DESC="${JOB_ERR_LINE:-task failed}"
  fi
fi

TITLE="${JOB_SHORT} > ${ERROR_DESC}"
TITLE="${TITLE:0:120}"
echo "  title: ${TITLE}"

# ── Current Command ───────────────────────────────────────────────────────────
CURRENT_COMMAND=$(grep "Current Command" "${LOG_FILES[@]}" 2>/dev/null \
  | grep -v "^Binary\|init --debug" \
  | tail -1 | sed 's/.*Current Command[[:space:]]*:[[:space:]]*//' || true)

# ── Error box ─────────────────────────────────────────────────────────────────
ERROR_BOX=""
[[ -f "$SOLO_LOG" ]] && \
  ERROR_BOX=$(awk '/╭─ ERROR/{found=1} found{print} /╰─/{if(found) exit}' "$SOLO_LOG" 2>/dev/null || true)

# Error details: prefer stack trace → box → solo errors → job errors
if [[ -n "${STACK_TRACE:-}" ]]; then
  ERROR_DETAILS="$STACK_TRACE"
elif [[ -n "${ERROR_BOX:-}" ]]; then
  ERROR_DETAILS="$ERROR_BOX"
elif [[ -n "${SOLO_ERRORS:-}" ]]; then
  ERROR_DETAILS=$(echo "$SOLO_ERRORS" | head -20)
else
  ERROR_DETAILS=$(echo "$JOB_ERRORS" | head -20)
fi

# ── Build issue body ──────────────────────────────────────────────────────────
BODY="## Failure Summary

The **${JOB_SHORT}** job failed on branch \`${HEAD_BRANCH}\`. Error: ${ERROR_DESC}

## Error Details

\`\`\`
${ERROR_DETAILS:-"(no error details extracted)"}
\`\`\`"

[[ -n "${CURRENT_COMMAND:-}" ]] && BODY+="

## Failed Command

\`\`\`
Current Command: ${CURRENT_COMMAND}
\`\`\`"

[[ -n "${DIAG_TEXT:-}" ]] && BODY+="

## Deployment Diagnostics

\`\`\`
${DIAG_TEXT}
\`\`\`"

BODY+="

## Workflow Information

- **Run**: [#${RUN_NUMBER}](${RUN_URL}) (attempt ${RUN_ATTEMPT})
- **Job**: [${JOB_NAME}](${JOB_URL})
- **Branch**: \`${HEAD_BRANCH}\`"

# ── Stage gist files ──────────────────────────────────────────────────────────
STAGE_DIR="${SCRATCH}/gist-stage"
rm -rf "$STAGE_DIR" && mkdir -p "$STAGE_DIR"

[[ -f "$JOB_LOG_PATH" ]] && cp "$JOB_LOG_PATH" "${STAGE_DIR}/"

while IFS= read -r -d '' artifact_file; do
  REL="${artifact_file#${ARTIFACT_DIR}/}"
  FLAT="${REL//\//__}"
  SIZE=$(stat -f%z "$artifact_file" 2>/dev/null || stat -c%s "$artifact_file" 2>/dev/null || echo 0)
  (( SIZE < 10485760 )) && cp "$artifact_file" "${STAGE_DIR}/${FLAT}"
done < <(find "$ARTIFACT_DIR" -type f ! -name "*.zip" -print0 2>/dev/null)

mapfile -t GIST_FILES < <(find "$STAGE_DIR" -maxdepth 1 -type f | sort)

if [[ ${#GIST_FILES[@]} -eq 0 ]]; then
  printf "(no log files available)\n" > "${STAGE_DIR}/no-logs.txt"
  GIST_FILES=("${STAGE_DIR}/no-logs.txt")
fi
echo "  ${#GIST_FILES[@]} file(s) staged for gist"

# ── Create secret gist ────────────────────────────────────────────────────────
# GH_TOKEN often lacks the gist scope; unset it so gh falls back to the keyring token.
echo "Creating secret gist..."
GIST_URL=$(env -u GH_TOKEN gh gist create \
  --desc "Solo CI failure logs — run ${RUN_ID} job ${JOB_ID} [${JOB_NAME}]" \
  "${GIST_FILES[@]}")
echo "  ${GIST_URL}"

GIST_ID=$(echo "$GIST_URL" | rev | cut -d/ -f1 | rev)
GIST_USER=$(echo "$GIST_URL" | sed 's|https://gist.github.com/||' | cut -d/ -f1)
RAW_BASE="https://gist.githubusercontent.com/${GIST_USER}/${GIST_ID}/raw"

FILE_LINKS=""
while IFS= read -r flat; do
  FILE_LINKS+="- [${flat//__//}](${RAW_BASE}/${flat})"$'\n'
done < <(ls "${STAGE_DIR}" | sort)
FILE_COUNT=$(ls "${STAGE_DIR}" | wc -l | tr -d ' ')

BODY+="

## Log Archives

- [CI Logs (secret gist)](${GIST_URL}) — ${FILE_COUNT} files (job log + complete \`${ARTIFACT_NAME:-artifact}\` artifact)

<details>
<summary>All files</summary>

${FILE_LINKS}
</details>"

# ── Create issue ──────────────────────────────────────────────────────────────
echo "Creating issue..."
RESPONSE=$(gh api graphql -f query="
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
ISSUE_ID=$(echo "$RESPONSE"  | jq -r '.data.createIssue.issue.id')
ISSUE_URL=$(echo "$RESPONSE" | jq -r '.data.createIssue.issue.url')
echo "Issue: $ISSUE_URL"

# ── Solo CLI Program Board → Ready / P0 ──────────────────────────────────────
ITEM_BOARD=$(gh api graphql -f query="
mutation {
  addProjectV2ItemById(input: {
    projectId: \"PVT_kwDOCq2Q984BQs6I\"
    contentId: \"$ISSUE_ID\"
  }) { item { id } }
}" 2>/dev/null | jq -r '.data.addProjectV2ItemById.item.id // empty' || true)

if [[ -n "${ITEM_BOARD:-}" ]]; then
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
else
  echo "Board: already exists (skipped field update)"
fi

# ── Solo X Team → Ready / P0-🔥 ──────────────────────────────────────────────
ITEM_TEAM=$(gh api graphql -f query="
mutation {
  addProjectV2ItemById(input: {
    projectId: \"PVT_kwDOCq2Q984A6EW6\"
    contentId: \"$ISSUE_ID\"
  }) { item { id } }
}" 2>/dev/null | jq -r '.data.addProjectV2ItemById.item.id // empty' || true)

if [[ -n "${ITEM_TEAM:-}" ]]; then
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
else
  echo "X Team: already exists (skipped field update)"
fi

# ── Link to initiative ────────────────────────────────────────────────────────
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
echo "Parent:    initiative ${PARENT_ISSUE_ID}"
echo "Logs:      $GIST_URL"
echo "════════════════════════════════════════════════════════"

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm -rf "${SCRATCH}"
echo "Cleaned up: ${SCRATCH}"
