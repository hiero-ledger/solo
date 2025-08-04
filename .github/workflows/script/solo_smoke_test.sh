#!/bin/bash
set -eo pipefail

#
# This script should be called after solo has been deployed with mirror node and relay node deployed,
# and should be called from the root of the solo repository
#
# This uses solo account creation function to repeatedly generate background transactions
# Then run smart contract test, and also javascript sdk sample test to interact with solo network
#

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

  npm install
  npx hardhat compile || log_and_exit 1

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
    echo "Check port forward i = $i out of 20" >> port-forward.log
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
  npm run solo-test -- account create --deployment "${SOLO_DEPLOYMENT}" --create-amount 1000 > /dev/null 2>&1 &
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
  if [[ $result -ne 0 ]]; then
    echo "Smart contract test failed with exit code $result"
    echo "Test local network connection using nc -zv 127.0.0.1 50211"
    nc -zv 127.0.0.1 50211

    log_and_exit $result
  fi
}

function start_sdk_test ()
{
  realm_num="${1:-0}"
  shard_num="${2:-0}"
  cd solo
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    curl -sSL "https://github.com/fullstorydev/grpcurl/releases/download/v1.9.3/grpcurl_1.9.3_linux_x86_64.tar.gz" | sudo tar -xz -C /usr/local/bin
  fi
  result=0
  grpcurl -plaintext -d '{"file_id": {"shardNum": '"$shard_num"', "realmNum": '"$realm_num"', "fileNum": 102}, "limit": 0}' localhost:8081 com.hedera.mirror.api.proto.NetworkService/getNodes || result=$?
  if [[ $result -ne 0 ]]; then
    echo "grpcurl command failed with exit code $result"
    log_and_exit $result
  fi
  result=0
  node examples/create-topic.js || result=$?
  cd -
  if [[ $result -ne 0 ]]; then
    echo "JavaScript SDK test failed with exit code $result"
  fi
  log_and_exit 0

}

function start_sdk_test2 ()
{
  realm_num="${1:-0}"
  shard_num="${2:-0}"
  cd solo
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    curl -sSL "https://github.com/fullstorydev/grpcurl/releases/download/v1.9.3/grpcurl_1.9.3_linux_x86_64.tar.gz" | sudo tar -xz -C /usr/local/bin
  fi
  result=0
  grpcurl -plaintext -d '{"file_id": {"shardNum": '"$shard_num"', "realmNum": '"$realm_num"', "fileNum": 102}, "limit": 0}' localhost:8081 com.hedera.mirror.api.proto.NetworkService/getNodes || result=$?
  if [[ $result -ne 0 ]]; then
    echo "grpcurl command failed with exit code $result"
    log_and_exit $result
  fi
  result=0
  node examples/create-topic.js || result=$?
  cd -
  if [[ $result -ne 0 ]]; then
    echo "JavaScript SDK test failed with exit code $result"
  fi
  log_and_exit $result

}
function check_monitor_log()
{
  namespace="${1}"
  # get the logs of mirror-monitor
  kubectl get pods -n "${namespace}" | grep mirror-monitor | awk '{print $1}' | xargs -IPOD kubectl logs -n "${namespace}" POD > mirror-monitor.log

  if grep -q "ERROR" mirror-monitor.log; then
    echo "mirror-monitor.log contains ERROR"

    echo "------- BEGIN LOG DUMP -------"
    echo
    cat mirror-monitor.log
    echo
    echo "------- END LOG DUMP -------"

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

  kubectl get pods -n "${namespace}" | grep mirror-importer | awk '{print $1}' | xargs -IPOD kubectl logs -n "${namespace}" POD > mirror-importer.log || result=$?
  if [[ $result -ne 0 ]]; then
    echo "Failed to get the mirror node importer logs with exit code $result"
    log_and_exit $result
  fi

  if grep -q "ERROR" mirror-importer.log; then
    echo "mirror-importer.log contains ERROR"
    echo "------- BEGIN LOG DUMP -------"
    echo
    cat mirror-importer.log
    echo
    echo "------- END LOG DUMP -------"
    log_and_exit 1
  fi
}

function log_and_exit()
{
  echo "load_log_and_exit begin with rc=$1"

  echo "------- BEGIN RELAY DUMP -------"
  kubectl get services -n "${SOLO_NAMESPACE}" --output=name | grep relay-node | grep -v '\-ws' | xargs -IRELAY kubectl logs -n "${SOLO_NAMESPACE}" RELAY > relay.log || true
  cat relay.log || true
  echo "------- END RELAY DUMP -------"

  echo "------- BEGIN MIRROR REST DUMP -------"
  kubectl get services -n "${SOLO_NAMESPACE}" --output=name | grep rest | grep -v '\-restjava' | xargs -IREST kubectl logs -n "${SOLO_NAMESPACE}" REST > rest.log || true
  cat rest.log || true
  echo "------- END MIRROR REST DUMP -------"

  echo "------- Last port-forward check -------" >> port-forward.log
  ps -ef |grep port-forward >> port-forward.log

  echo "------- BEGIN PORT-FORWARD DUMP -------"
  cat port-forward.log
  echo "------- END PORT-FORWARD DUMP -------"

  # sleep for a few seconds to give time for stdout to stream back in case it was called using nodejs
  sleep 5
  if [[ "$1" == "0" ]]; then
    echo "Script completed successfully."
    return 0
  else
    echo "An error occurred while running the script: $1"
    return 1
  fi
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
start_background_transactions
check_port_forward
start_contract_test
start_sdk_test "${REALM_NUM}" "${SHARD_NUM}"
start_sdk_test2 "${REALM_NUM}" "${SHARD_NUM}"

