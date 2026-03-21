#!/bin/bash
set -eo pipefail

#
# This script should be called after solo has been deployed with mirror node and relay node deployed,
# and should be called from the root of the solo repository
#
# This uses solo account creation function to repeatedly generate background transactions
# Then run smart contract test, and also javascript sdk sample test to interact with solo network
#
export USE_MIRROR_NODE_LEGACY_RELEASE_NAME="true"
export PATH=~/.solo/bin:${PATH}
source .github/workflows/script/helper.sh

function clone_smart_contract_repo ()
{
  echo "Clone hedera-smart-contracts"
  if [ -d "hedera-smart-contracts" ]; then
    echo "Directory hedera-smart-contracts exists."
  else
    echo "Directory hedera-smart-contracts does not exist."
    git clone https://github.com/hashgraph/hedera-smart-contracts --branch only-erc20-tests-v3
  fi
}

function setup_smart_contract_test ()
{
  echo "Setup smart contract test"
  cd hedera-smart-contracts

  echo "Remove previous .env file"
  rm -f .env

  printf "\r::group::Install dependencies and compile smart contract\n"
  npm install
  npx hardhat compile || log_and_exit 1
  printf "\r::endgroup::\n"

  echo "Build .env file"

  echo "PRIVATE_KEYS=\"$CONTRACT_TEST_KEYS\"" > .env
  echo "RETRY_DELAY=5000 # ms" >> .env
  echo "MAX_RETRY=5" >> .env
  cat .env
  cd -
}

function check_port_forward ()
{
  # run background task for few minutes
  for i in {1..20}
  do
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Check port forward i = $i out of 20" >> port-forward.log
    ps -ef |grep port-forward >> port-forward.log
    sleep 10
  done &
}

function start_background_transactions ()
{
  echo "Start background transaction"
  # generate accounts as background traffic for two minutes
  # so record stream files can be kept pushing to mirror node
  cd solo
  npm run solo-test -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --create-amount 1000 > /dev/null 2>&1 &
  cd -
}

function start_contract_test ()
{
  cd hedera-smart-contracts
  echo "Wait a few seconds for background transactions to start"
  sleep 10
  echo "Run smart contract test"
  result=0
  npm run hh:test || result=$?
  cd -

  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    printf "\r::group::Test local network connection using nc\n"
    echo "Test local network connection using nc"
    if command -v nc >/dev/null 2>&1; then
      nc -zv 127.0.0.1 50211 || true
    elif command -v ncat >/dev/null 2>&1; then
      ncat -zv 127.0.0.1 50211 || true
    elif timeout 2 bash -c '</dev/tcp/127.0.0.1/50211' >/dev/null 2>&1; then
      echo "Connected to 127.0.0.1:50211 via /dev/tcp probe"
    else
      echo "Skipping nc probe: neither nc nor ncat installed"
    fi
    printf "\r::endgroup::\n"
  fi

  if [[ $result -ne 0 ]]; then
    echo "Smart contract test failed with exit code $result"
    log_and_exit $result
  fi
}

function start_sdk_test ()
{
  realm_num="${1:-0}"
  shard_num="${2:-0}"
  cd solo
  result=0
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if ! command -v grpcurl >/dev/null 2>&1; then
      curl -sSL "https://github.com/fullstorydev/grpcurl/releases/download/v1.9.3/grpcurl_1.9.3_linux_x86_64.tar.gz" | sudo tar -xz -C /usr/local/bin
    fi
  fi
  for attempt in {1..20}
  do
    grpcurl -plaintext -d '{"file_id": {"shardNum": '"$shard_num"', "realmNum": '"$realm_num"', "fileNum": 102}, "limit": 0}' localhost:8081 com.hedera.mirror.api.proto.NetworkService/getNodes && break
    result=$?
    echo "grpcurl attempt ${attempt}/20 failed with exit code ${result}; waiting for mirror ingress to become ready"
    sleep 5
  done
  if [[ $result -ne 0 ]]; then
    echo "grpcurl command failed with exit code $result"
    kubectl get pods -n "${SOLO_NAMESPACE}" -o wide || true
    kubectl get svc -n "${SOLO_NAMESPACE}" | grep -E 'mirror|ingress' || true
    log_and_exit $result
  fi
  result=0
  node scripts/create-topic.js || result=$?
  cd -
  if [[ $result -ne 0 ]]; then
    echo "JavaScript SDK test failed with exit code $result"
    log_and_exit $result
  fi
}

function check_monitor_log()
{
  namespace="${1}"
  context="${2:-${MIRROR_KUBE_CONTEXT}}"
  monitorPods=$(kubectl --context "${context}" get pods -n "${namespace}" -o name | sed 's#pod/##' | grep -E '^mirror(-1)?-monitor' || true)
  if [[ -z "${monitorPods}" ]]; then
    echo "No mirror monitor pod found in namespace ${namespace} on context ${context} (expected mirror-monitor or mirror-1-monitor)."
    log_and_exit 1
  fi
  # get the logs of mirror-monitor
  while IFS= read -r podName; do
    [[ -z "${podName}" ]] && continue
    kubectl --context "${context}" logs -n "${namespace}" "${podName}"
  done <<< "${monitorPods}" > mirror-monitor.log

  if grep -q "ERROR" mirror-monitor.log; then
    echo "mirror-monitor.log contains ERROR"
    printf "\r::group::mirror-monitor log dump\n"

    echo "------- BEGIN LOG DUMP -------"
    echo
    cat mirror-monitor.log
    echo
    echo "------- END LOG DUMP -------"
    printf "\r::endgroup::\n"

    log_and_exit 1
  fi

  # any line contains "Scenario pinger published" should contain the string "Errors: {}"
  if grep -q "Scenario pinger published" mirror-monitor.log; then
    if grep -q "Errors: {}" mirror-monitor.log; then
      echo "mirror-monitor.log contains Scenario pinger published and Errors: {}"
    else
      echo "mirror-monitor.log contains Scenario pinger published but not Errors: {}"
      log_and_exit 1
    fi
  fi
}

function check_importer_log()
{
  namespace="${1}"
  context="${2:-${MIRROR_KUBE_CONTEXT}}"
  importerPods=$(kubectl --context "${context}" get pods -n "${namespace}" -o name | sed 's#pod/##' | grep -E '^mirror(-1)?-importer' || true)
  if [[ -z "${importerPods}" ]]; then
    echo "No mirror importer pod found in namespace ${namespace} on context ${context} (expected mirror-importer or mirror-1-importer)."
    log_and_exit 1
  fi

  while IFS= read -r podName; do
    [[ -z "${podName}" ]] && continue
    kubectl --context "${context}" logs -n "${namespace}" "${podName}"
  done <<< "${importerPods}" > mirror-importer.log || result=$?
  if [[ $result -ne 0 ]]; then
    echo "Failed to get the mirror node importer logs with exit code $result"
    log_and_exit $result
  fi

  if grep -q "ERROR" mirror-importer.log; then
    echo "mirror-importer.log contains ERROR"
    printf "\r::group::mirror-importer log dump\n"
    echo "------- BEGIN LOG DUMP -------"
    echo
    cat mirror-importer.log
    echo
    echo "------- END LOG DUMP -------"
    printf "\r::endgroup::\n"
    log_and_exit 1
  fi
}

function resolve_mirror_release_name()
{
  local namespace="$1"
  local context
  local release_name

  for context in $(kubectl config get-contexts -o name); do
    # Prefer canonical mirror release names from the target namespace.
    release_name="$(helm list -n "${namespace}" --kube-context "${context}" --filter '^mirror(-[0-9]+)?$' -q 2>/dev/null | head -n 1)"

    # Fallback: detect by chart name if release naming differs.
    if [ -z "${release_name}" ]; then
      release_name="$(helm list -n "${namespace}" --kube-context "${context}" 2>/dev/null | awk 'NR>1 && $6 ~ /^hedera-mirror-/ {print $1; exit}')"
    fi

    if [ -n "${release_name}" ]; then
      echo "${release_name}|${context}"
      return 0
    fi
  done

  echo "Unable to detect mirror Helm release from 'helm list -n ${namespace}' across kube contexts" >&2
  return 1
}

echo "Change to parent directory"

cd ../
rm -rf port-forward.log || true

if [ -z "${SOLO_DEPLOYMENT}" ]; then
  export SOLO_DEPLOYMENT="solo-deployment"
fi

if [ -z "${SOLO_NAMESPACE}" ]; then
  export SOLO_NAMESPACE="solo-e2e"
fi

create_test_account "${SOLO_DEPLOYMENT}"
clone_smart_contract_repo
setup_smart_contract_test
check_port_forward
start_contract_test
start_sdk_test "${REALM_NUM}" "${SHARD_NUM}"
echo "Sleep a while to wait background transactions to finish"
sleep 30

echo "Run mirror node acceptance test on namespace ${SOLO_NAMESPACE}"
mirror_release=""
MIRROR_KUBE_CONTEXT=""
if ! mirror_release_and_context="$(resolve_mirror_release_name "${SOLO_NAMESPACE}")"; then
  echo "No mirror Helm release found in namespace ${SOLO_NAMESPACE}."
  echo "Current Helm releases in ${SOLO_NAMESPACE}:"
  for context in $(kubectl config get-contexts -o name); do
    echo "Context: ${context}"
    helm list -n "${SOLO_NAMESPACE}" --kube-context "${context}" || true
  done
  echo "All contexts:"
  kubectl config get-contexts -o name || true
  log_and_exit 1
fi
IFS='|' read -r mirror_release MIRROR_KUBE_CONTEXT <<< "${mirror_release_and_context}"

if [ -z "${mirror_release}" ] || [ -z "${MIRROR_KUBE_CONTEXT}" ]; then
  echo "Failed to resolve both mirror release and kube context for namespace ${SOLO_NAMESPACE}."
  log_and_exit 1
fi

printf "\r::group::mirror-test log dump\n"
echo "Using mirror release: ${mirror_release} (context: ${MIRROR_KUBE_CONTEXT}), running 'helm test'..."
helm test "${mirror_release}" -n "${SOLO_NAMESPACE}" --kube-context "${MIRROR_KUBE_CONTEXT}" --timeout 2m || result=$?
if [[ $result -ne 0 ]]; then
  echo "------- BEGIN mirror test log -------"
  cat mirror_test.log
  echo "------- END mirror test log -------"
  printf "\r::endgroup::\n"
  log_and_exit $result
fi
echo "Finished mirror node acceptance test on namespace ${SOLO_NAMESPACE}"
printf "\r::endgroup::\n"
result=0

check_monitor_log "${SOLO_NAMESPACE}" "${MIRROR_KUBE_CONTEXT}"

if [ -n "$1" ]; then
  echo "Skip mirror importer log check"
else
  check_importer_log "${SOLO_NAMESPACE}" "${MIRROR_KUBE_CONTEXT}"
fi
log_and_exit $?
