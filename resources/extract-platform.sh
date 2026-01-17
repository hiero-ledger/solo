#!/bin/bash
# This script fetch the build.zip file and checksum file from builds.hedera.com and then extract it into HapiApp2 directory
# Usage extract-platform <release-version>
# e.g. extract-platform v0.42.5
set -o pipefail

readonly HAPI_DIR=/opt/hgcapp/services-hedera/HapiApp2.0
readonly LOG_FILE="${HAPI_DIR}/output/extract-platform.log"

function log() {
  local message="${1}"

  if [[ ! -f "${LOG_FILE}" ]]; then
    mkdir -p "${HAPI_DIR}/output"
    touch "${LOG_FILE}"
  fi

  printf "%s - %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "${message}" | tee -a "${LOG_FILE}"
}

readonly tag="${1}"
if [[ -z "${tag}" ]]; then
  echo "Release tag is required (e.g. v0.42.5)"
  exit 1
fi

RELEASE_DIR="$(awk -F'.' '{print $1"."$2}' <<<"${tag}")"
readonly RELEASE_DIR
readonly HEDERA_USER_HOME_DIR=/home/hedera
readonly HEDERA_BUILDS_URL='https://builds.hedera.com'
readonly BUILD_ZIP_FILE="${HEDERA_USER_HOME_DIR}/build-${tag}.zip"
readonly BUILD_ZIP_URL="${HEDERA_BUILDS_URL}/node/software/${RELEASE_DIR}/build-${tag}.zip"
readonly CHECKSUM_FILE="${HEDERA_USER_HOME_DIR}/build-${tag}.sha384"
readonly CHECKSUM_URL="${HEDERA_BUILDS_URL}/node/software/${RELEASE_DIR}/build-${tag}.sha384"

log "extract-platform.sh: begin................................"

# download
log "Checking if ${BUILD_ZIP_FILE} exists..."
if [[ ! -f "${BUILD_ZIP_FILE}" ]]; then
  log "Downloading ${BUILD_ZIP_URL}..."
  curl -sSf "${BUILD_ZIP_URL}" -o "${BUILD_ZIP_FILE}" > >(tee -a "${LOG_FILE}") 2>&1
  ec="${?}"
  if [[ "${ec}" -ne 0 ]]; then
    log "Failed to download ${BUILD_ZIP_URL}. Error code: ${ec}"
    exit 1
  fi
fi

log "Checking if ${CHECKSUM_FILE} exists..."

if [[ ! -f "${CHECKSUM_FILE}" ]]; then
  log "Downloading ${CHECKSUM_URL}..."
  curl -sSf "${CHECKSUM_URL}" -o "${CHECKSUM_FILE}" > >(tee -a "${LOG_FILE}") 2>&1
  ec="${?}"
  if [[ "${ec}" -ne 0 ]]; then
    log "Failed to download ${CHECKSUM_URL}. Error code: ${ec}"
    exit 1
  fi
fi

# shellcheck disable=SC2164
cd ${HEDERA_USER_HOME_DIR}
ec="${?}"

if [[ "${ec}" -ne 0 ]]; then
  log "Failed to change directory to ${HEDERA_USER_HOME_DIR}. Error code: ${ec}"
  exit 1
fi

log "Verifying SHA sum of ${BUILD_ZIP_FILE} against ${CHECKSUM_FILE}"
sha384sum -c "${CHECKSUM_FILE}" > >(tee -a "${LOG_FILE}") 2>&1
ec="${?}"
if [[ "${ec}" -ne 0 ]]; then
  log "SHA384 sum of ${BUILD_ZIP_FILE} does not match. Aborting."
  exit 1
fi

log "Deleting previous version under $HAPI_DIR/data/lib/*.jar and $HAPI_DIR/data/apps/*.jar"
rm -rvf ${HAPI_DIR}/data/lib/*.jar > >(tee -a "${LOG_FILE}") 2>&1
rm -rvf ${HAPI_DIR}/data/apps/*.jar > >(tee -a "${LOG_FILE}") 2>&1

# ensure the HapiApp2.0 directory exists
if [[ ! -d "${HAPI_DIR}" ]]; then
  log "Creating directory ${HAPI_DIR}"
  mkdir -p "${HAPI_DIR}" > >(tee -a "${LOG_FILE}") 2>&1
  ec="${?}"
  if [[ "${ec}" -ne 0 ]]; then
    log "Failed to create directory ${HAPI_DIR}"
    exit 1
  fi

  chown hedera:hedera "${HAPI_DIR}" > >(tee -a "${LOG_FILE}") 2>&1
  ec="${?}"
  if [[ "${ec}" -ne 0 ]]; then
    log "Failed to change ownership of ${HAPI_DIR} to the hedera user and group"
    exit 1
  fi
fi

# extract
echo "Extracting Hedera platform artifact"

extract_with_available_tool() {
  if command -v unzip >/dev/null 2>&1; then
    (
      cd /tmp/extract || exit 1
      unzip -q "${BUILD_ZIP_FILE}" > >(tee -a "${LOG_FILE}") 2>&1
    )
    return $?
  elif command -v jar >/dev/null 2>&1; then
    (
      cd /tmp/extract || exit 1
      jar -xf "${BUILD_ZIP_FILE}" > >(tee -a "${LOG_FILE}") 2>&1
    )
    return $?
  fi

  log "Neither unzip nor jar command is available to extract ${BUILD_ZIP_FILE}"
  return 127
}

# To avoid "Device or resource busy" error when unzip tries to delete pre-existing file first before extracting
# Uncompress to a temporary directory and then move the files to the target directory

mkdir -p /tmp/extract
ec="${?}"
if [[ "${ec}" -ne 0 ]]; then
  log "Failed to create temporary directory /tmp/extract. Error code: ${ec}"
  exit 1
fi

extract_with_available_tool
ec="${?}"
if [[ "${ec}" -ne 0 ]]; then
  log "Failed to extract ${BUILD_ZIP_FILE}. Error code: ${ec}"
  exit 1
fi

cp -rf /tmp/extract/data/lib/* "${HAPI_DIR}/data/lib/" > >(tee -a "${LOG_FILE}") 2>&1
ec="${?}"
if [[ "${ec}" -ne 0 ]]; then
  log "Failed to copy libraries from /tmp/extract/lib to ${HAPI_DIR}/data/lib. Error code: ${ec}"
  exit 1
fi

cp -rf /tmp/extract/data/apps/* "${HAPI_DIR}/data/apps/" > >(tee -a "${LOG_FILE}") 2>&1
ec="${?}"
if [[ "${ec}" -ne 0 ]]; then
  log "Failed to copy applications from /tmp/extract/apps to ${HAPI_DIR}/data/apps. Error code: ${ec}"
  exit 1
fi

cp -f /tmp/extract/VERSION "${HAPI_DIR}/VERSION" > >(tee -a "${LOG_FILE}") 2>&1
ec="${?}"
if [[ "${ec}" -ne 0 ]]; then
  log "Failed to copy VERSION file from /tmp/extract to ${HAPI_DIR}/VERSION. Error code: ${ec}"
  exit 1
fi

cp -f /tmp/extract/immediate.sh "${HAPI_DIR}/immediate.sh" > >(tee -a "${LOG_FILE}") 2>&1
ec="${?}"
if [[ "${ec}" -ne 0 ]]; then
  log "Failed to copy immediate.sh from /tmp/extract to ${HAPI_DIR}/immediate.sh. Error code: ${ec}"
  exit 1
fi

cp -f /tmp/extract/during-freeze.sh "${HAPI_DIR}/during_freeze.sh" > >(tee -a "${LOG_FILE}") 2>&1
ec="${?}"
if [[ "${ec}" -ne 0 ]]; then
  log "Failed to copy during-freeze.sh from /tmp/extract to ${HAPI_DIR}/during-freeze.sh. Error code: ${ec}"
  exit 1
fi

log "Removing temporary directory /tmp/extract"
rm -rf /tmp/extract > >(tee -a "${LOG_FILE}") 2>&1
ec="${?}"
if [[ "${ec}" -ne 0 ]]; then
  log "Failed to remove temporary directory /tmp/extract. Error code: ${ec}"
  exit 1
fi

log "................................end: extract-platform.sh"
exit 0
