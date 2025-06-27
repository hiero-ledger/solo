#!/bin/bash
set -eo pipefail

#
# This script should be called after solo has been deployed with mirror node and relay node deployed,
# and should be called from the root of the solo repository
#
# This uses solo account creation function to repeatedly generate background transactions
# Then run smart contract test, and also javascript sdk sample test to interact with solo network
#

echo "Starting solo_smoke_test.sh"
source .github/workflows/script/helper.sh
echo "Sourced helper script"

function clone_smart_contract_repo ()
{
  echo "Cloning hedera-smart-contracts repository..."
  if [ -d "hedera-smart-contracts" ]; then
    echo "Directory hedera-smart-contracts already exists."
  else
    echo "Directory hedera-smart-contracts does not exist. Cloning now..."
    git clone https://github.com/hashgraph/hedera-smart-contracts --branch only-erc20-tests
    echo "Repository cloned successfully"
  fi
}

function setup_smart_contract_test ()
{
  echo "Setting up smart contract test environment..."
  cd hedera-smart-contracts
  echo "Removing previous .env file if it exists"
  rm -f .env

  echo "Installing npm dependencies"
  npm install
  echo "🔨 Compiling smart contracts"
  npx hardhat compile || return 1

  echo "Building .env file"
  echo "PRIVATE_KEYS=\"$CONTRACT_TEST_KEYS\"" > .env
  echo "RETRY_DELAY=5000 # ms" >> .env
  echo "MAX_RETRY=5" >> .env
  echo "Created .env file:"
  cat .env
  cd -
  echo "Smart contract test environment setup complete"
}

function check_port_forward ()
{
  echo "Starting port forwarding check..."
  # run background task for few minutes
  for i in {1..20}
  do
    echo "Port forward check $i of 20"
    ps -ef |grep port-forward
    sleep 5
  done &
  echo "Port forward check started in background"
}

function start_background_transactions ()
{
  echo "Starting background transactions..."
  # generate accounts as background traffic for two minutes
  # so record stream files can be kept pushing to mirror node
  cd solo
  echo "Creating accounts to generate network traffic"
  npm run solo-test -- account create --deployment "${SOLO_DEPLOYMENT}" --create-amount 15 > /dev/null 2>&1 &
  cd -
  echo "Background transactions started"
}

function start_contract_test ()
{
  echo "Starting smart contract tests..."
  cd hedera-smart-contracts
  echo "Waiting a few seconds for background transactions to start"
  sleep 5
  echo "Running smart contract tests now"
  npm run hh:test
  result=$?
  echo "Smart contract test result: $result"

  cd -
  return $result
}

function start_sdk_test ()
{
  echo "Starting SDK tests..."
  cd solo
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Installing grpcurl on Linux"
    curl -sSL "https://github.com/fullstorydev/grpcurl/releases/download/v1.9.3/grpcurl_1.9.3_linux_x86_64.tar.gz" | sudo tar -xz -C /usr/local/bin
  fi
  echo "Testing gRPC connection"
  grpcurl -plaintext -d '{"file_id": {"fileNum": 102}, "limit": 0}' localhost:5600 com.hedera.mirror.api.proto.NetworkService/getNodes
  echo "Running create-topic example"
  node examples/create-topic.js
  result=$?
  echo "SDK test result: $result"

  cd -
  return $result
}

function check_monitor_log()
{
  echo "Checking mirror-monitor logs..."
  # get the logs of mirror-monitor
  kubectl get pods -n solo-e2e | grep mirror-monitor | awk '{print $1}' | xargs -IPOD kubectl logs -n solo-e2e POD > mirror-monitor.log
  echo "Retrieved mirror-monitor logs"

  echo "Checking for ERROR entries in logs"
  if grep -q "ERROR" mirror-monitor.log; then
    echo "ERROR found in mirror-monitor logs"

    echo "------- BEGIN LOG DUMP -------"
    echo
    cat mirror-monitor.log
    echo
    echo "------- END LOG DUMP -------"

    exit 1
  else
    echo "No ERROR entries found in mirror-monitor logs"
  fi

  echo "Checking pinger scenario output"
  # any line contains "Scenario pinger published" should contain the string "Errors: {}"
  if grep -q "Scenario pinger published" mirror-monitor.log; then
    if grep -q "Errors: {}" mirror-monitor.log; then
      echo "Pinger scenario completed successfully"
    else
      echo "Pinger scenario contains errors"
      exit 1
    fi
  else
    echo "No pinger scenario output found in logs"
  fi
}

function check_importer_log()
{
  echo "Checking mirror-importer logs..."
  kubectl get pods -n solo-e2e | grep mirror-importer | awk '{print $1}' | xargs -IPOD kubectl logs -n solo-e2e POD > mirror-importer.log
  echo "Retrieved mirror-importer logs"

  echo "Checking for ERROR entries in logs"
  if grep -q "ERROR" mirror-importer.log; then
    echo "ERROR found in mirror-importer logs"

    echo "------- BEGIN LOG DUMP -------"
    echo
    cat mirror-importer.log
    echo
    echo "------- END LOG DUMP -------"

    exit 1
  else
    echo "No ERROR entries found in mirror-importer logs"
  fi
}

echo "Changing to parent directory"
cd ../
if [ -z "${SOLO_DEPLOYMENT}" ]; then
  echo "SOLO_DEPLOYMENT not set, using default value: solo-e2e"
  export SOLO_DEPLOYMENT="solo-e2e"
else
  echo "Using SOLO_DEPLOYMENT: ${SOLO_DEPLOYMENT}"
fi

echo "Creating test account"
create_test_account "${SOLO_DEPLOYMENT}"
echo "Cloning smart contract repository"
clone_smart_contract_repo
echo "Setting up smart contract testing environment"
setup_smart_contract_test
#echo "Starting background transactions"
#start_background_transactions
#echo "Checking port forwarding"
#check_port_forward
echo "Running smart contract tests"
start_contract_test
echo "Running SDK tests"
start_sdk_test
echo "Sleeping to wait for background transactions to finish"
sleep 30

echo "Running mirror node acceptance test"
helm test mirror -n solo-e2e --timeout 10m
echo "Checking monitor logs"
check_monitor_log

if [ -n "$1" ]; then
  echo " Skipping mirror importer log check due to parameter"
else
  echo "Checking importer logs"
  check_importer_log
fi

echo "Solo smoke test completed successfully!"