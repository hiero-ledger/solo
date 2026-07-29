#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Solo CI Failure Logger — Phase 3: Preserve logs + create GitHub issue
#
# Reads state written by phase1-gather.sh, stages all log files into a secret
# gist, creates a P0 Bug issue in hiero-ledger/solo, adds it to both project
# boards, and links it as a sub-issue of the current quarter initiative.
#
# Usage:
#   SOLO_CI_TITLE="<title>" \
#   SOLO_CI_BODY=$(cat <<'BODY_EOF'
#   <markdown body — everything except the Log Archives section>
#   BODY_EOF
#   ) \
#   bash phase3-create.sh <RUN_ID> [<PARENT_ISSUE_ID>]
#
# Arguments:
#   RUN_ID            Required. Workflow run ID from phase1-gather.sh output.
#   PARENT_ISSUE_ID   Optional. Defaults to Q3 2026 Developer Experience initiative.
#
# Environment variables:
#   SOLO_CI_TITLE   Required. Issue title (single line, ≤120 chars).
#   SOLO_CI_BODY    Required. Issue body markdown (without Log Archives section —
#                   this script appends that section automatically after gist creation).
#
# What this script does (in order):
#   1. Reads /tmp/solo-ci-<RUN_ID>/phase1-state.json
#   2. Re-downloads job log / artifact only if Phase 1 files are missing
#   3. Stages all non-binary log files into a flat gist directory
#   4. Creates a secret gist (never expires; not publicly listed)
#   5. Appends a "Log Archives" section to SOLO_CI_BODY with the gist URL + file links
#   6. Creates the GitHub issue (Bug type, P0-🔥 label)
#   7. Adds issue to Solo CLI Program Board at Ready/P0
#   8. Adds issue to Solo X Team at Ready/P0-🔥
#   9. Links issue as sub-issue of the initiative
#  10. Cleans up /tmp/solo-ci-<RUN_ID>
#
# Requirements: gh (with repo + gist scopes), jq

set -euo pipefail

RUN_ID="${1:?Usage: bash phase3-create.sh <RUN_ID> [PARENT_ISSUE_ID]}"
PARENT_ISSUE_ID="${2:-I_kwDOLMTWdc8AAAABIo7dFw}"
TITLE="${SOLO_CI_TITLE:?SOLO_CI_TITLE env var must be set}"
BODY_HEAD="${SOLO_CI_BODY:?SOLO_CI_BODY env var must be set}"

SCRATCH="/tmp/solo-ci-${RUN_ID}"
STATE_FILE="${SCRATCH}/phase1-state.json"

[[ -f "$STATE_FILE" ]] || {
  echo "ERROR: Phase 1 state not found at ${STATE_FILE}"
  echo "       Run phase1-gather.sh first, or check that RUN_ID is correct."
  exit 1
}

JOB_ID=$(jq -r '.job_id' "$STATE_FILE")
JOB_NAME=$(jq -r '.job_name' "$STATE_FILE")
ARTIFACT_NAME=$(jq -r '.artifact_name' "$STATE_FILE")
RUN_NUMBER=$(jq -r '.run_number' "$STATE_FILE")
ARTIFACT_DIR="${SCRATCH}/artifact"
JOB_LOG_PATH="${SCRATCH}/job-${JOB_ID}.log"

# ════════════════════════════════════════════════════════════════════════════════
# 1. Re-download job log only if Phase 1 cache is missing
# ════════════════════════════════════════════════════════════════════════════════
if [[ ! -s "$JOB_LOG_PATH" ]]; then
  echo "Downloading job log (Phase 1 cache miss)..."
  gh api "repos/hiero-ledger/solo/actions/jobs/${JOB_ID}/logs" \
    > "$JOB_LOG_PATH" 2>/dev/null \
    && echo "  $(wc -l < "$JOB_LOG_PATH") lines" \
    || { echo "  unavailable"; echo "(job log unavailable)" > "$JOB_LOG_PATH"; }
else
  echo "Job log: reusing Phase 1 cache ($(wc -l < "$JOB_LOG_PATH") lines)"
fi

# ════════════════════════════════════════════════════════════════════════════════
# 2. Re-download artifact only if Phase 1 cache is missing
# ════════════════════════════════════════════════════════════════════════════════
if [[ -n "${ARTIFACT_NAME:-}" ]] && [[ -z "$(ls -A "$ARTIFACT_DIR" 2>/dev/null)" ]]; then
  echo "Downloading artifact ${ARTIFACT_NAME} (Phase 1 cache miss)..."
  gh run download "${RUN_ID}" --repo hiero-ledger/solo \
    --name "${ARTIFACT_NAME}" --dir "$ARTIFACT_DIR/" 2>/dev/null \
    && echo "  downloaded" || echo "  not found or expired — continuing without it"
else
  echo "Artifact: reusing Phase 1 cache"
fi

# ════════════════════════════════════════════════════════════════════════════════
# 3. Stage all non-binary files into a flat gist directory
#    Directory separators encoded as __ so every file gets a unique flat name.
# ════════════════════════════════════════════════════════════════════════════════
STAGE_DIR="${SCRATCH}/gist-stage"
rm -rf "$STAGE_DIR" && mkdir -p "$STAGE_DIR"

[[ -f "$JOB_LOG_PATH" ]] && cp "$JOB_LOG_PATH" "${STAGE_DIR}/"

while IFS= read -r -d '' f; do
  REL="${f#${ARTIFACT_DIR}/}"
  FLAT="${REL//\//__}"
  SIZE=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
  (( SIZE < 10485760 )) && cp "$f" "${STAGE_DIR}/${FLAT}"
done < <(find "$ARTIFACT_DIR" -type f ! -name "*.zip" -print0 2>/dev/null)

mapfile -t GIST_FILES < <(find "$STAGE_DIR" -maxdepth 1 -type f | sort)
echo "  ${#GIST_FILES[@]} file(s) staged for gist"

# ════════════════════════════════════════════════════════════════════════════════
# 4. Create secret gist
#    GH_TOKEN often lacks the gist scope; unset it so gh falls back to the
#    keyring token which carries the full scope.
# ════════════════════════════════════════════════════════════════════════════════
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
  display="${flat//__//}"
  FILE_LINKS+="- [${display}](${RAW_BASE}/${flat})"$'\n'
done < <(ls "${STAGE_DIR}" | sort)

FILE_COUNT=$(ls "${STAGE_DIR}" | wc -l | tr -d ' ')

# ════════════════════════════════════════════════════════════════════════════════
# 5. Append Log Archives section to body (gist URL now known)
# ════════════════════════════════════════════════════════════════════════════════
BODY="${BODY_HEAD}

## Log Archives

- [CI Logs (secret gist)](${GIST_URL}) — ${FILE_COUNT} files (job log + complete \`${ARTIFACT_NAME}\` artifact)

<details>
<summary>All files</summary>

${FILE_LINKS}
</details>"

# ════════════════════════════════════════════════════════════════════════════════
# 6. Create issue
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
# 7. Add to Solo CLI Program Board → Ready / P0
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
# 8. Add to Solo X Team → Ready / P0-🔥
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
# 9. Set as sub-issue of initiative
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
echo "Parent:    initiative ${PARENT_ISSUE_ID}"
echo "Logs:      $GIST_URL"
echo "════════════════════════════════════════════════════════"

# ════════════════════════════════════════════════════════════════════════════════
# 10. Cleanup
# ════════════════════════════════════════════════════════════════════════════════
rm -rf "/tmp/solo-ci-${RUN_ID}"
echo "Cleaned up: /tmp/solo-ci-${RUN_ID}"
