#!/usr/bin/env bash
set -euo pipefail

LOG_PREFIX="[copy-node-configs]"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  printf "%s %s %s\n" "${LOG_PREFIX}" "$(timestamp)" "$*"
}

CONFIG_DIR="${SRC_CONFIG_DIR:-/etc/network-node/config}"
SHARED_DIR="${SRC_SHARED_DIR:-/shared-hapiapp}"
DEST_DIR="${DEST_DIR:-/opt/hgcapp/services-hedera/HapiApp2.0}"

FILES=(
  "log4j2.xml"
  "config.txt"
  "settings.txt"
  "hedera.crt"
  "hedera.key"
)

log "Starting config copy"
log "CONFIG_DIR=${CONFIG_DIR}"
log "SHARED_DIR=${SHARED_DIR}"
log "DEST_DIR=${DEST_DIR}"

mkdir -p "${DEST_DIR}"

if [[ -d "${CONFIG_DIR}" ]]; then
  log "Listing config directory: ${CONFIG_DIR}"
  ls -l "${CONFIG_DIR}" || true
else
  log "Config directory missing: ${CONFIG_DIR}"
fi

if [[ -d "${SHARED_DIR}" ]]; then
  log "Listing shared directory: ${SHARED_DIR}"
  ls -l "${SHARED_DIR}" || true
else
  log "Shared directory missing: ${SHARED_DIR}"
fi

missing=false

copy_file() {
  local file_name="$1"
  shift
  local dest_path="${DEST_DIR}/${file_name}"

  for src_path in "$@"; do
    if [[ -e "${src_path}" ]]; then
      log "Copying ${src_path} -> ${dest_path}"
      cp -vL "${src_path}" "${dest_path}"
      ls -l "${dest_path}"
      return 0
    fi
    log "Source not found for ${file_name} at ${src_path}"
  done

  log "ERROR: Unable to locate ${file_name} in provided source paths"
  return 1
}

for file_name in "${FILES[@]}"; do
  case "${file_name}" in
    hedera.crt|hedera.key)
      if ! copy_file "${file_name}" "${SHARED_DIR}/${file_name}" "${CONFIG_DIR}/${file_name}"; then
        missing=true
      fi
      ;;
    *)
      if ! copy_file "${file_name}" "${CONFIG_DIR}/${file_name}" "${SHARED_DIR}/${file_name}"; then
        missing=true
      fi
      ;;
  esac
done

log "Final destination listing:"
ls -l "${DEST_DIR}" || true

if ${missing}; then
  log "Completed with missing files"
  exit 1
fi

log "All files copied successfully"
