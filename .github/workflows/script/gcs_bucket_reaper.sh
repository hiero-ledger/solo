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
  gcloud storage ls "gs://${bucket}/" --project="${PROJECT_ID}" 2>/dev/null \
    | sed -E "s#^gs://${bucket}/##; s#/$##" \
    | cut -d'/' -f1 \
    | sed '/^$/d' \
    | sort -u
}

get_latest_activity_epoch_for_prefix() {
  local bucket="$1"
  local prefix="$2"
  local latest_datetime

  latest_datetime="$(
    gcloud storage ls --recursive --long "gs://${bucket}/${prefix}/**" --project="${PROJECT_ID}" 2>/dev/null \
      | awk '
          $1 ~ /^[0-9]+$/ {
            datetime = $2
            for (i = 3; i < NF; i++) {
              datetime = datetime " " $i
            }
            print datetime
          }
        ' \
      | sort \
      | tail -n1
  )"

  if [[ -z "${latest_datetime}" ]]; then
    echo ""
    return 0
  fi

  date -u -d "${latest_datetime}" +%s 2>/dev/null || echo ""
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

    # Only reap CI run prefixes (GitHub job IDs) to avoid touching non-CI paths.
    if [[ ! "${prefix}" =~ ^[0-9]+$ ]]; then
      echo "Skipping non-CI prefix gs://${bucket}/${prefix}"
      continue
    fi

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
