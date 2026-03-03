#!/usr/bin/env bash
set -euo pipefail

# Optional arg: path/pattern to a prebuilt tarball. If omitted or unmatched,
# this script creates a temporary tarball via npm pack.
TARBALL_PATTERN="${1:-}"
TARBALL=""

if [[ -n "${TARBALL_PATTERN}" ]] && ls ${TARBALL_PATTERN} >/dev/null 2>&1; then
  TARBALL="$(ls ${TARBALL_PATTERN} | head -n 1)"
else
  VERIFY_DIR="$(mktemp -d)"
  npm pack --pack-destination "${VERIFY_DIR}" >/dev/null
  TARBALL="$(ls "${VERIFY_DIR}"/*.tgz | head -n 1)"
fi

EXPECTED_VERSION="$(node -p "require('./package.json').version")"
ROOT_VERSION="$(tar -xOf "${TARBALL}" package/package.json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")"
DIST_VERSION="$(tar -xOf "${TARBALL}" package/dist/package.json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")"

echo "expected_version=${EXPECTED_VERSION}"
echo "root_package_version=${ROOT_VERSION}"
echo "dist_package_version=${DIST_VERSION}"

if [[ "${ROOT_VERSION}" != "${EXPECTED_VERSION}" ]]; then
  echo "::error::Tarball root package version (${ROOT_VERSION}) does not match expected (${EXPECTED_VERSION})."
  exit 1
fi

if [[ "${DIST_VERSION}" != "${EXPECTED_VERSION}" ]]; then
  echo "::error::Tarball dist package version (${DIST_VERSION}) does not match expected (${EXPECTED_VERSION})."
  exit 1
fi
