#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Solo CI Failure Logger — Phase 1: Gather
#
# Fetches run/job metadata, downloads the job log + best-matching artifact,
# extracts error context, and writes a state file for phase3-create.sh.
#
# Usage:
#   bash phase1-gather.sh <workflow-url>
#
# Example:
#   bash phase1-gather.sh "https://github.com/hiero-ledger/solo/actions/runs/12345/job/67890"
#
# Outputs:
#   - Structured terminal output with error context
#   - /tmp/solo-ci-<RUN_ID>/phase1-state.json  (read by phase3-create.sh)
#   - /tmp/solo-ci-<RUN_ID>/job-<JOB_ID>.log   (preserved for gist)
#   - /tmp/solo-ci-<RUN_ID>/artifact/           (downloaded artifact files)
#
# Requirements: gh (with repo + gist scopes), jq

set -euo pipefail

INPUT_URL="${1:?Usage: bash phase1-gather.sh <workflow-url>}"

# ── Parse IDs from URL ────────────────────────────────────────────────────────
RUN_ID=$(echo "$INPUT_URL" | grep -oE 'runs/[0-9]+'    | head -1 | cut -d/ -f2 || true)
JOB_ID=$(echo "$INPUT_URL" | grep -oE 'job/[0-9]+'     | head -1 | cut -d/ -f2 || true)
SUITE_ID=$(echo "$INPUT_URL" | grep -oE 'suites/[0-9]+' | head -1 | cut -d/ -f2 || true)

# ── Resolve suite → run if needed ────────────────────────────────────────────
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
echo "RUN_ID=${RUN_ID}  JOB_ID=${JOB_ID:-<resolving...>}"

# ── Stable scratch dir (phase3-create.sh reads from here) ────────────────────
SCRATCH="/tmp/solo-ci-${RUN_ID}"
mkdir -p "${SCRATCH}/artifact"

# ── Run metadata ──────────────────────────────────────────────────────────────
echo ""
echo "=== RUN INFO ==="
RUN_META=$(gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}" \
  --jq '{name:.name,run_number:.run_number,head_branch:.head_branch,
         html_url:.html_url,attempt:.run_attempt}')
echo "$RUN_META"

# ── Job info ──────────────────────────────────────────────────────────────────
echo ""
echo "=== JOB INFO ==="
if [[ -n "${JOB_ID:-}" ]]; then
  JOB_META=$(gh api "repos/hiero-ledger/solo/actions/jobs/${JOB_ID}" \
    --jq '{id:.id,name:.name,conclusion:.conclusion,html_url:.html_url}')
else
  JOB_META=$(gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}/jobs?per_page=100" \
    --jq '[.jobs[]|select(.conclusion=="failure")]|first|
          {id:.id,name:.name,conclusion:.conclusion,html_url:.html_url}')
  JOB_ID=$(echo "$JOB_META" | jq -r '.id')
fi
echo "$JOB_META"
JOB_NAME=$(echo "$JOB_META" | jq -r '.name')

# ── Artifacts — list + auto-select best match ─────────────────────────────────
echo ""
echo "=== ARTIFACTS ==="
ARTIFACTS_JSON=$(gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}/artifacts" 2>/dev/null \
  || echo '{"artifacts":[]}')
echo "$ARTIFACTS_JSON" | jq -r '.artifacts[]|"  \(.name)  (\(.size_in_bytes)B  expired=\(.expired))"'

# Score by word overlap between job-name slug and artifact name
JOB_SLUG=$(echo "$JOB_NAME" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//;s/-$//')
ARTIFACT_NAME=$(echo "$ARTIFACTS_JSON" | jq -r --arg slug "$JOB_SLUG" '
  [.artifacts[]|select(.expired==false)]
  | map(. + {score:(
      [($slug|split("-")[]),(.name|split("-")[])]
      | group_by(.) | map(select(length>1)) | length
    )})
  | sort_by(-.score) | .[0].name // ""' 2>/dev/null || true)
# Fallback: first non-expired artifact containing "log"
[[ -z "${ARTIFACT_NAME:-}" ]] && \
  ARTIFACT_NAME=$(echo "$ARTIFACTS_JSON" | \
    jq -r '[.artifacts[]|select(.expired==false)|select(.name|test("log";"i"))]|.[0].name//"" ')
# Fallback: any non-expired artifact
[[ -z "${ARTIFACT_NAME:-}" ]] && \
  ARTIFACT_NAME=$(echo "$ARTIFACTS_JSON" | \
    jq -r '[.artifacts[]|select(.expired==false)]|.[0].name//"" ')
echo "Selected artifact: ${ARTIFACT_NAME:-"(none)"}"

# ── Job log: tee to disk AND grep errors in a single pass ─────────────────────
# Never use `gh run view --log-failed` — it returns empty for matrix/integration jobs.
echo ""
echo "=== JOB LOG ERRORS ==="
JOB_LOG_PATH="${SCRATCH}/job-${JOB_ID}.log"
gh api "repos/hiero-ledger/solo/actions/jobs/${JOB_ID}/logs" 2>/dev/null \
  | tee "$JOB_LOG_PATH" \
  | grep -E "SOLO-[0-9]+|╭|╰|Current Command|##\[error\]|AssertionError|Timeout of [0-9]+ms|failed with error|exit status [1-9][0-9]*|[0-9]+ failing" \
  | grep -v "timeout_minutes\|continue_on_error\|shell:\|DOCKER_HOST\|STEP_TIMEOUT\|warn deprecated" \
  | head -100 \
  || echo "(log unavailable)"
echo "  saved: ${JOB_LOG_PATH}  ($(wc -l < "${JOB_LOG_PATH}" 2>/dev/null || echo 0) lines)"

# ── Download artifact ─────────────────────────────────────────────────────────
if [[ -n "${ARTIFACT_NAME:-}" ]]; then
  echo ""
  echo "=== DOWNLOADING ARTIFACT: ${ARTIFACT_NAME} ==="
  gh run download "${RUN_ID}" --repo hiero-ledger/solo \
    --name "${ARTIFACT_NAME}" --dir "${SCRATCH}/artifact/" 2>/dev/null \
    && echo "  downloaded to ${SCRATCH}/artifact/" \
    || echo "  not found or expired — continuing without it"
fi

# ── Diagnostics summary ───────────────────────────────────────────────────────
echo ""
echo "=== DIAGNOSTICS ==="
DIAG="${SCRATCH}/artifact/hiero-components-logs/diagnostics-analysis.txt"
[[ -f "$DIAG" ]] && cat "$DIAG" || echo "(no diagnostics-analysis.txt in artifact)"

# ── solo.log errors ───────────────────────────────────────────────────────────
echo ""
echo "=== SOLO.LOG ERRORS ==="
SOLO_LOG="${SCRATCH}/artifact/solo.log"
if [[ -f "$SOLO_LOG" ]]; then
  grep -E "ERROR|SOLO-[0-9]+|Current Command" "$SOLO_LOG" | head -60
else
  echo "(no solo.log in artifact)"
fi

# ── Write state file for phase3-create.sh ────────────────────────────────────
STATE_FILE="${SCRATCH}/phase1-state.json"
jq -n \
  --arg  run_id        "$RUN_ID" \
  --arg  job_id        "$JOB_ID" \
  --arg  job_name      "$JOB_NAME" \
  --argjson run_meta   "$RUN_META" \
  --argjson job_meta   "$JOB_META" \
  --arg  artifact_name "${ARTIFACT_NAME:-}" \
  --arg  scratch       "$SCRATCH" \
  '{
    run_id:        $run_id,
    job_id:        $job_id,
    job_name:      $job_name,
    run_number:    ($run_meta.run_number | tostring),
    run_url:       $run_meta.html_url,
    attempt:       ($run_meta.attempt | tostring),
    head_branch:   $run_meta.head_branch,
    job_url:       $job_meta.html_url,
    artifact_name: $artifact_name,
    scratch:       $scratch
  }' > "$STATE_FILE"

# ── Print synthesis context for Claude to read ───────────────────────────────
echo ""
echo "=== SYNTHESIS CONTEXT ==="
jq -r 'to_entries[] | "\(.key):\t\(.value)"' "$STATE_FILE"
echo "=== END SYNTHESIS CONTEXT ==="
echo ""
echo "State saved to: ${STATE_FILE}"
echo "Phase 3 command:"
echo "  SOLO_CI_TITLE=\"...\" SOLO_CI_BODY=\$(cat <<'BODY_EOF'"
echo "  <body markdown — see Body format>"
echo "  BODY_EOF"
echo "  ) bash \"\$(dirname \"\$0\")/phase3-create.sh\" \"${RUN_ID}\""
