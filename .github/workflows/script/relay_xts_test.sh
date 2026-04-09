#!/bin/bash
##
# Copyright (C) 2023-2025 Hedera Hashgraph, LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
##

# relay_xts_test.sh
#
# Deploys a Solo one-shot Hedera network, clones the relay test branch,
# builds the relay, configures its environment, and runs the XTS acceptance
# tests via HAProxy to validate Solo's haproxy memory and port-forward behavior.
#
# Usage:
#   SOLO_CMD=<cmd> VALUES_FILE=<file> .github/workflows/script/relay_xts_test.sh
#   or:
#   .github/workflows/script/relay_xts_test.sh <solo_cmd> <values_file>
#
# Environment variables (can also be passed as positional arguments):
#   SOLO_CMD       - The solo CLI command (e.g. "npm run solo --" or "npx @hashgraph/solo")
#   VALUES_FILE    - Path to the values YAML file for one-shot deploy
#   RELAY_DIR      - Directory to clone relay into (default: /tmp/hiero-json-rpc-relay)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

SOLO_CMD="${SOLO_CMD:-${1:-}}"
VALUES_FILE="${VALUES_FILE:-${2:-}}"
RELAY_DIR="${RELAY_DIR:-/tmp/hiero-json-rpc-relay}"

RELAY_BRANCH="relay-x-solo-haproxy-issue"
RELAY_REPO="https://github.com/hiero-ledger/hiero-json-rpc-relay.git"

# Port numbers used by Solo's port-forward scheme (updated defaults in constants.ts):
#   GRPC_LOCAL_PORT     = 35211  (consensus node gRPC; old default was 50211)
#   MIRROR_NODE_PORT    = 38081  (mirror node REST;    old default was  8081)
#   Relay server itself = 7546   (relay process runs locally, unchanged)
MIRROR_NODE_URL="http://127.0.0.1:38081"
HEDERA_NETWORK='{"127.0.0.1:35211":"0.0.3"}'
E2E_RELAY_HOST="http://localhost:7546"

if [[ -z "${SOLO_CMD}" ]]; then
  echo "Error: SOLO_CMD is required"
  echo "Usage: SOLO_CMD=<cmd> VALUES_FILE=<file> $0"
  exit 1
fi

if [[ -z "${VALUES_FILE}" ]]; then
  echo "Error: VALUES_FILE is required"
  echo "Usage: SOLO_CMD=<cmd> VALUES_FILE=<file> $0"
  exit 1
fi

# Read relay version from version.ts for informational logging
RELAY_VERSION=""
if [[ -f "${REPO_ROOT}/version.ts" ]]; then
  RELAY_VERSION=$(awk -F"'" '/^export const HEDERA_JSON_RPC_RELAY_VERSION/ {print $(NF-1); exit}' "${REPO_ROOT}/version.ts")
fi
echo "Relay version from version.ts: ${RELAY_VERSION:-<not found>}"
echo "Relay test branch: ${RELAY_BRANCH}"

# ── Step 1: Deploy the Solo Network ──────────────────────────────────────────
echo "::group::Deploy Solo Network (One-Shot)"
export PATH=~/.solo/bin:${PATH}

echo "Deploying Solo network using: ${SOLO_CMD}"
echo "Values file: ${VALUES_FILE}"
$SOLO_CMD one-shot falcon deploy --values-file "${VALUES_FILE}"
echo "::endgroup::"

# ── Step 2: Clone the Relay repository ───────────────────────────────────────
echo "::group::Clone Relay Repository"
echo "Cloning ${RELAY_REPO} branch ${RELAY_BRANCH} into ${RELAY_DIR}"
rm -rf "${RELAY_DIR}"
git clone --depth 1 --branch "${RELAY_BRANCH}" "${RELAY_REPO}" "${RELAY_DIR}"
echo "::endgroup::"

# ── Step 3: Build the Relay project ──────────────────────────────────────────
echo "::group::Build Relay"
cd "${RELAY_DIR}"
# The relay monorepo has peer-dependency conflicts that require force install.
npm install -f
npm run build
echo "::endgroup::"

# ── Step 4: Configure Relay Environment ──────────────────────────────────────
echo "::group::Configure Relay Environment"
cat > "${RELAY_DIR}/.env" << EOF
CHAIN_ID="0x12a"
MIRROR_NODE_URL="${MIRROR_NODE_URL}"
HEDERA_NETWORK='${HEDERA_NETWORK}'
OPERATOR_ID_MAIN=0.0.2
OPERATOR_KEY_MAIN=302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137
REDIS_ENABLED=false
USE_ASYNC_TX_PROCESSING=false
E2E_RELAY_HOST=${E2E_RELAY_HOST}
SDK_LOG_LEVEL=trace
USE_INTERNAL_RELAY=false
EOF
echo "Relay .env configured:"
cat "${RELAY_DIR}/.env"
echo "::endgroup::"

# ── Step 5: Run XTS Acceptance Tests ─────────────────────────────────────────
echo "::group::Run Relay XTS Acceptance Tests (via HAProxy)"
cd "${RELAY_DIR}"
# Some tests are expected to fail due to HAProxy's strict timeout configuration.
# Run with set +e so the overall script reports the result without aborting.
set +e
npm run acceptancetest:xts
XTS_EXIT_CODE=$?
set -e
if [[ ${XTS_EXIT_CODE} -ne 0 ]]; then
  echo "::warning::XTS tests completed with exit code ${XTS_EXIT_CODE}. Some failures are expected when running via HAProxy."
fi
echo "::endgroup::"

echo "Relay XTS test run complete (exit code: ${XTS_EXIT_CODE})"
exit "${XTS_EXIT_CODE}"
