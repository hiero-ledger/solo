#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_S3_PROJECT_ID:?GCP_S3_PROJECT_ID is required}"
RETENTION_HOURS="${REAPER_RETENTION_HOURS:-24}"
DRY_RUN="${DRY_RUN:-false}"

readonly BUCKETS=("solo-ci-backups" "solo-ci-test-streams")
readonly RETRY_ATTEMPTS=3

if [[ ! "${RETENTION_HOURS}" =~ ^[0-9]+$ ]]; then
  echo "Invalid REAPER_RETENTION_HOURS='${RETENTION_HOURS}', expected non-negative integer"
  exit 1
fi

cutoff_epoch="$(date -u -d "-${RETENTION_HOURS} hours" +%s)"

echo "Starting GCS bucket reaper"
echo "Project: ${PROJECT_ID}"
echo "Retention (hours): ${RETENTION_HOURS}"
echo "Dry run: ${DRY_RUN}"
echo "Cutoff UTC: $(date -u -d "@${cutoff_epoch}" '+%Y-%m-%d %H:%M:%S')"

get_prefixes() {
  local bucket="$1"
  # Use grep+cut instead of sed to avoid $# being expanded by bash inside the
  # double-quoted sed expression (inside this function $# == 1, which corrupts
  # the s-command delimiter structure and produces "unterminated s command").
  gcloud storage ls "gs://${bucket}/" --project="${PROJECT_ID}" 2>/dev/null \
    | grep -E "^gs://${bucket}/[0-9]+/" \
    | cut -d'/' -f4 \
    | grep -E '^[0-9]+$' \
    | sort -u
}

get_latest_activity_epoch_for_prefix() {
  local bucket="$1"
  local prefix="$2"
  local latest_updated

  # Primary: structured metadata query — works when objects have a populated
  # 'updated' field.  Also fetches 'timeCreated' as a fallback column so that
  # newly-uploaded objects that have never been mutated still return a date.
  latest_updated="$(
    gcloud storage objects list "gs://${bucket}/${prefix}/" \
      --project="${PROJECT_ID}" \
      --format='value(updated,timeCreated)' \
      2>/dev/null \
      | tr '\t' '\n' \
      | grep -v '^$' \
      | sort \
      | tail -n1 || true
  )"

  # Secondary fallback: recursive ls -l.  GCS virtual folder placeholders
  # (zero-byte objects created by the console "Create folder" button) show no
  # timestamp in the metadata API, but their real child objects do appear in
  # the recursive listing.  Output format: "  SIZE  TIMESTAMP  gs://..."
  if [[ -z "${latest_updated}" ]]; then
    latest_updated="$(
      gcloud storage ls -l -r "gs://${bucket}/${prefix}/**" \
        --project="${PROJECT_ID}" \
        2>/dev/null \
        | grep -v '^TOTAL:' \
        | awk 'NF>=3 {print $2}' \
        | grep -v '^$' \
        | sort \
        | tail -n1 || true
    )"
  fi

  if [[ -z "${latest_updated}" ]]; then
    echo ""
    return 0
  fi

  date -u -d "${latest_updated}" +%s 2>/dev/null || echo ""
}

delete_prefix() {
  local bucket="$1"
  local prefix="$2"
  local target="gs://${bucket}/${prefix}"

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[DRY RUN] Would delete ${target}"
    return 0
  fi

  for attempt in $(seq 1 "${RETRY_ATTEMPTS}"); do
    if gcloud storage rm --recursive "${target}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
      echo "Deleted ${target}"
      return 0
    fi
    echo "Delete attempt ${attempt}/${RETRY_ATTEMPTS} failed for ${target}"
    sleep $((attempt * 2))
  done

  echo "Failed to delete ${target} after ${RETRY_ATTEMPTS} attempts"
  return 1
}

cleanup_failures=0

for bucket in "${BUCKETS[@]}"; do
  echo
  echo "Scanning bucket: gs://${bucket}"
  mapfile -t prefixes < <(get_prefixes "${bucket}" || true)

  if [[ "${#prefixes[@]}" -eq 0 ]]; then
    echo "No prefixes found in gs://${bucket}"
    continue
  fi

  for prefix in "${prefixes[@]}"; do
    [[ -z "${prefix}" ]] && continue

    latest_epoch="$(get_latest_activity_epoch_for_prefix "${bucket}" "${prefix}")"
    if [[ -z "${latest_epoch}" ]]; then
      echo "Skipping ${bucket}/${prefix}: unable to determine latest activity"
      continue
    fi

    if (( latest_epoch <= cutoff_epoch )); then
      latest_readable="$(date -u -d "@${latest_epoch}" '+%Y-%m-%d %H:%M:%S')"
      echo "Deleting stale prefix gs://${bucket}/${prefix} (latest activity UTC: ${latest_readable})"
      delete_prefix "${bucket}" "${prefix}" || cleanup_failures=1
    else
      echo "Keeping recent prefix gs://${bucket}/${prefix}"
    fi
  done
done

if [[ "${cleanup_failures}" -ne 0 ]]; then
  echo "GCS bucket reaper finished with cleanup failures"
  exit 1
fi

echo "GCS bucket reaper completed successfully"
