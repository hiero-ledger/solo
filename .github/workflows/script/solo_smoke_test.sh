#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
set -eo pipefail

#
# This script should be called after solo has been deployed with mirror node and relay node deployed,
# and should be called from the root of the solo repository
#
# This uses solo account creation function to repeatedly generate background transactions
# Then run smart contract test, and also javascript sdk sample test to interact with solo network
#
export PATH=~/.solo/bin:${PATH}
source .github/workflows/script/helper.sh

function clone_smart_contract_repo ()
{
  echo "Clone hedera-smart-contracts"
  if [ -d "hedera-smart-contracts" ]; then
    echo "Directory hedera-smart-contracts exists."
  else
    echo "Directory hedera-smart-contracts does not exist."
    git clone https://github.com/hashgraph/hedera-smart-contracts --branch only-erc20-tests-v4
  fi

  echo "Increase ERC20 smoke test timeout for block stream mirror propagation"
  if ! grep -q "const DEFAULT_TIMEOUT = 120000;" hedera-smart-contracts/test/openzeppelin/ERC-20/ERC20.js; then
    echo "Expected ERC20 smoke test timeout constant was not found"
    log_and_exit 1
  fi
  sed -i.bak 's/const DEFAULT_TIMEOUT = 120000;/const DEFAULT_TIMEOUT = 360000;/' hedera-smart-contracts/test/openzeppelin/ERC-20/ERC20.js
  rm -f hedera-smart-contracts/test/openzeppelin/ERC-20/ERC20.js.bak

  echo "Patch ERC20 smoke test ABI arguments"
  if ! grep -q "factory.deploy(Constants.TOKEN_NAME, 'TOKENSYMBOL', Constants.GAS_LIMIT_10_000_000)" hedera-smart-contracts/test/openzeppelin/ERC-20/ERC20.js; then
    echo "Expected ERC20 deploy gas argument was not found"
    log_and_exit 1
  fi
  sed -i.bak "s/factory.deploy(Constants.TOKEN_NAME, 'TOKENSYMBOL', Constants.GAS_LIMIT_10_000_000)/factory.deploy(Constants.TOKEN_NAME, 'TOKENSYMBOL')/" hedera-smart-contracts/test/openzeppelin/ERC-20/ERC20.js
  rm -f hedera-smart-contracts/test/openzeppelin/ERC-20/ERC20.js.bak

  if ! grep -q "erc20Contract.mint(wallet1, firstMintAmount, Constants.GAS_LIMIT_10_000_000)" hedera-smart-contracts/test/openzeppelin/ERC-20/ERC20.js; then
    echo "Expected ERC20 mint gas argument was not found"
    log_and_exit 1
  fi
  sed -i.bak "s/erc20Contract.mint(wallet1, firstMintAmount, Constants.GAS_LIMIT_10_000_000)/erc20Contract.mint(wallet1, firstMintAmount)/" hedera-smart-contracts/test/openzeppelin/ERC-20/ERC20.js
  rm -f hedera-smart-contracts/test/openzeppelin/ERC-20/ERC20.js.bak

  echo "Patch ERC20 smoke test to avoid receipt hash lookups"
  node <<'NODE'
const fs = require('fs');

const file = 'hedera-smart-contracts/test/openzeppelin/ERC-20/ERC20.js';
let source = fs.readFileSync(file, 'utf8');

const sleepFunction = `function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
`;
const waitForContractDeploymentFunction = `function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForContractDeployment(contract, maxAttempts = 60) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await contract.name();
      return;
    } catch (error) {
      lastError = error;
      await sleep(2000);
    }
  }

  throw lastError;
}
`;

if (!source.includes('async function waitForContractDeployment(')) {
  if (!source.includes(sleepFunction)) {
    throw new Error('Expected ERC20 sleep function was not found');
  }
  source = source.replace(sleepFunction, waitForContractDeploymentFunction);
}

const receiptBasedDeploy = `        const deployReceipt = await deployed.deploymentTransaction().wait();
        erc20Contract = factory.attach(deployReceipt.contractAddress);
        await sleep(3500); // wait for consensus on write transactions
        console.log(\`erc20Contract = \${deployReceipt.contractAddress}\`);`;
const receiptlessDeploy = `        const erc20ContractAddress = await deployed.getAddress();
        erc20Contract = factory.attach(erc20ContractAddress);
        await waitForContractDeployment(erc20Contract);
        console.log(\`erc20Contract = \${erc20ContractAddress}\`);`;

if (source.includes(receiptBasedDeploy)) {
  source = source.replace(receiptBasedDeploy, receiptlessDeploy);
} else if (!source.includes(receiptlessDeploy)) {
  throw new Error('Expected ERC20 receipt-based deployment block was not found');
}

const receiptBasedApproval = `      const approveResponse = await erc20Contract.approve(await erc20Contract.getAddress(), transferAmount);
      expect(
        (await approveResponse?.wait())?.logs?.filter(
          (e) => e.fragment.name === Constants.Events.Approval
        )
      ).to.not.be.empty;
      await sleep(3500); // wait for consensus on write transactions`;
const receiptlessApproval = `      await erc20Contract.approve(await erc20Contract.getAddress(), transferAmount);
      await sleep(3500); // wait for consensus on write transactions`;

if (source.includes(receiptBasedApproval)) {
  source = source.replace(receiptBasedApproval, receiptlessApproval);
} else if (!source.includes(receiptlessApproval)) {
  throw new Error('Expected ERC20 receipt-based approval block was not found');
}

fs.writeFileSync(file, source);
NODE
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


function start_contract_test ()
{
  cd hedera-smart-contracts
  echo "Show current port forward for debugging purpose"
  ps -ef | grep port-forward
  echo "Run SDK-backed ERC20 smart contract smoke test"
  result=0
  node <<'NODE' || result=$?
const {
  AccountId,
  Client,
  ContractCreateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  PrivateKey,
} = require('@hashgraph/sdk');
const {ethers} = require('ethers');
const artifact = require('./artifacts/contracts/openzeppelin/ERC-20/ERC20Mock.sol/OZERC20Mock.json');

const firstMintAmount = 1000n;
const transferAmount = 33n;
const relayUrl = 'http://127.0.0.1:37546';
const nodeAddress = '127.0.0.1:35211';
const nodeAccountId = '0.0.3';
const tokenName = 'tokenName';
const tokenSymbol = 'TOKENSYMBOL';

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeAddress(address) {
  return address.replace(/^0x/i, '');
}

function uint256(value) {
  return value.toString();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function executeContractFunction(client, contractId, functionName, parameters) {
  const transaction = await new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(1_000_000)
    .setFunction(functionName, parameters)
    .execute(client);

  const receipt = await transaction.getReceipt(client);
  if (receipt.status.toString() !== 'SUCCESS') {
    throw new Error(`${functionName} failed with status ${receipt.status.toString()}`);
  }
}

function createClient(operatorId, operatorKey, nodeAccountId) {
  const client = Client.forNetwork({[nodeAddress]: AccountId.fromString(nodeAccountId)});
  client.setOperator(operatorId, operatorKey);
  return client;
}

async function waitForExpectedValue(label, callback, expected, maxAttempts = 90) {
  let actual;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      actual = await callback();
      lastError = undefined;
      if (actual === expected) {
        console.log(`${label} ready [attempt=${attempt}/${maxAttempts}, value=${actual}]`);
        return actual;
      }

      console.log(`${label} not ready [attempt=${attempt}/${maxAttempts}, actual=${actual}, expected=${expected}]`);
    } catch (error) {
      lastError = error;
      console.log(`${label} not ready [attempt=${attempt}/${maxAttempts}, error=${error.message}]`);
    }

    await sleep(2000);
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`${label} did not reach expected value ${expected}; last value was ${actual}`);
}

async function deployErc20Contract(client) {
  const createTransaction = await new ContractCreateTransaction()
    .setGas(10_000_000)
    .setBytecode(ethers.getBytes(artifact.bytecode))
    .setConstructorParameters(new ContractFunctionParameters().addString(tokenName).addString(tokenSymbol))
    .execute(client);
  const createReceipt = await createTransaction.getReceipt(client);
  if (createReceipt.status.toString() !== 'SUCCESS') {
    throw new Error(`Contract create failed with status ${createReceipt.status.toString()}`);
  }

  const contractId = createReceipt.contractId;
  const contractAddress = `0x${contractId.toSolidityAddress()}`;
  console.log(`erc20Contract = ${contractAddress}`);
  console.log(`erc20ContractId = ${contractId.toString()}`);
  return {contractAddress, contractId};
}

async function main() {
  const operatorId = AccountId.fromString(requireEnvironment('OPERATOR_ID'));
  const operatorKey = PrivateKey.fromStringDer(requireEnvironment('OPERATOR_KEY'));
  const keys = requireEnvironment('CONTRACT_TEST_KEYS')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  if (keys.length < 2) {
    throw new Error('CONTRACT_TEST_KEYS must contain at least two private keys');
  }

  const wallet1 = new ethers.Wallet(keys[0]).address;
  const wallet2 = new ethers.Wallet(keys[1]).address;
  console.log(`wallet1 = ${wallet1}`);
  console.log(`wallet2 = ${wallet2}`);

  const provider = new ethers.JsonRpcProvider(relayUrl);
  const client = createClient(operatorId, operatorKey, nodeAccountId);
  const {contractAddress, contractId} = await deployErc20Contract(client);
  const erc20Contract = new ethers.Contract(contractAddress, artifact.abi, provider);

  const actualName = await waitForExpectedValue('token name', async () => await erc20Contract.name(), tokenName);
  if (actualName !== tokenName) {
    throw new Error(`Unexpected token name: ${actualName}`);
  }

  const actualSymbol = await waitForExpectedValue('token symbol', async () => await erc20Contract.symbol(), tokenSymbol);
  if (actualSymbol !== tokenSymbol) {
    throw new Error(`Unexpected token symbol: ${actualSymbol}`);
  }

  const actualDecimals = await waitForExpectedValue('token decimals', async () => await erc20Contract.decimals(), 18n);
  if (actualDecimals !== 18n) {
    throw new Error(`Unexpected token decimals: ${actualDecimals}`);
  }

  await executeContractFunction(
    client,
    contractId,
    'mint',
    new ContractFunctionParameters().addAddress(normalizeAddress(wallet1)).addUint256(uint256(firstMintAmount)),
  );

  const totalSupply = await waitForExpectedValue(
    'total supply after mint',
    async () => await erc20Contract.totalSupply(),
    firstMintAmount,
  );
  if (totalSupply !== firstMintAmount) {
    throw new Error(`Unexpected total supply: ${totalSupply}`);
  }

  const wallet1BalanceBefore = await waitForExpectedValue(
    'wallet1 balance after mint',
    async () => await erc20Contract.balanceOf(wallet1),
    firstMintAmount,
  );
  const wallet2BalanceBefore = await erc20Contract.balanceOf(wallet2);
  if (wallet1BalanceBefore !== firstMintAmount || wallet2BalanceBefore !== 0n) {
    throw new Error(`Unexpected initial balances: wallet1=${wallet1BalanceBefore}, wallet2=${wallet2BalanceBefore}`);
  }

  await executeContractFunction(
    client,
    contractId,
    'transfer',
    new ContractFunctionParameters().addAddress(normalizeAddress(wallet2)).addUint256(uint256(transferAmount)),
  );

  const wallet1BalanceAfterTransfer = await waitForExpectedValue(
    'wallet1 balance after transfer',
    async () => await erc20Contract.balanceOf(wallet1),
    firstMintAmount - transferAmount,
  );
  const wallet2BalanceAfterTransfer = await waitForExpectedValue(
    'wallet2 balance after transfer',
    async () => await erc20Contract.balanceOf(wallet2),
    transferAmount,
  );
  if (wallet1BalanceAfterTransfer !== firstMintAmount - transferAmount) {
    throw new Error(`Unexpected wallet1 balance after transfer: ${wallet1BalanceAfterTransfer}`);
  }
  if (wallet2BalanceAfterTransfer !== transferAmount) {
    throw new Error(`Unexpected wallet2 balance after transfer: ${wallet2BalanceAfterTransfer}`);
  }

  await executeContractFunction(
    client,
    contractId,
    'approve',
    new ContractFunctionParameters().addAddress(normalizeAddress(contractAddress)).addUint256(uint256(transferAmount)),
  );

  const allowance = await waitForExpectedValue(
    'allowance after approve',
    async () => await erc20Contract.allowance(wallet1, contractAddress),
    transferAmount,
  );
  if (allowance !== transferAmount) {
    throw new Error(`Unexpected allowance: ${allowance}`);
  }

  console.log('SDK-backed ERC20 smart contract smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
  cd -

  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    printf "\r::group::Test local network connection using nc\n"
    echo "Test local network connection using nc"
    nc -zv 127.0.0.1 35211 || ncat -zv 127.0.0.1 35211 || true
    printf "\r::endgroup::\n"
  fi

  if [[ $result -ne 0 ]]; then
    echo "Smart contract test failed with exit code $result"
    log_and_exit $result
  fi
}

function wait_for_contract_test_accounts ()
{
  local relay_url="${1:-http://127.0.0.1:37546}"
  local mirror_url="${2:-http://127.0.0.1:38081}"
  local max_attempts="${3:-60}"
  local sleep_seconds="${4:-5}"
  local -a contract_test_addresses=()
  local address=""
  local attempt=0
  local ready=0
  local relay_response=""
  local mirror_response=""
  local derived_addresses=""
  local address_lower=""

  echo "Resolve contract test addresses from generated private keys"
  derived_addresses=$(
    cd hedera-smart-contracts && CONTRACT_TEST_KEYS="${CONTRACT_TEST_KEYS}" node - <<'NODE'
const { Wallet } = require('ethers');

const keys = (process.env.CONTRACT_TEST_KEYS || '')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean);

for (const key of keys) {
  console.log(new Wallet(key).address);
}
NODE
  )

  while IFS= read -r address; do
    [[ -z "${address}" ]] && continue
    contract_test_addresses+=("${address}")
  done <<EOF
${derived_addresses}
EOF

  if [[ ${#contract_test_addresses[@]} -eq 0 ]]; then
    echo "Could not derive contract test addresses from CONTRACT_TEST_KEYS"
    log_and_exit 1
  fi

  echo "Wait for contract test accounts to become visible through relay and mirror"
  for address in "${contract_test_addresses[@]}"; do
    ready=0
    address_lower=$(printf '%s' "${address}" | tr '[:upper:]' '[:lower:]')
    for ((attempt = 1; attempt <= max_attempts; attempt++)); do
      relay_response=$(curl -sS -H 'content-type: application/json' \
        --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionCount\",\"params\":[\"${address}\",\"latest\"],\"id\":1}" \
        "${relay_url}" || true)
      mirror_response=$(curl -sS "${mirror_url}/api/v1/accounts/${address}" || true)

      if echo "${relay_response}" | grep -Eq '"result":"0x[0-9a-fA-F]+"' && \
        echo "${mirror_response}" | grep -q "\"evm_address\":\"${address_lower}\""; then
        echo "Account ${address} is ready [attempt=${attempt}/${max_attempts}]"
        ready=1
        break
      fi

      echo "Account ${address} not ready yet [attempt=${attempt}/${max_attempts}]"
      sleep "${sleep_seconds}"
    done

    if [[ ${ready} -ne 1 ]]; then
      echo "Timed out waiting for account ${address} to appear in relay/mirror"
      echo "Last relay response: ${relay_response}"
      echo "Last mirror response: ${mirror_response}"
      log_and_exit 1
    fi
  done
}

function get_latest_mirror_block_number ()
{
  local mirror_url="${1:-http://127.0.0.1:38081}"
  local response=""

  response=$(curl -sfS \
    -H 'Cache-Control: no-cache, no-store, must-revalidate' \
    -H 'Pragma: no-cache' \
    -H 'Expires: 0' \
    "${mirror_url}/api/v1/blocks?limit=1&order=desc" || true)

  node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
try {
  const data = JSON.parse(input);
  const value = Number(data.blocks?.[0]?.number);
  console.log(Number.isFinite(value) ? value : -1);
} catch {
  console.log(-1);
}
' <<< "${response}"
}

function wait_for_mirror_block_progress ()
{
  local label="${1}"
  local previous_block="${2:--1}"
  local required_new_blocks="${3:-3}"
  local max_attempts="${4:-120}"
  local sleep_seconds="${5:-2}"
  local latest_block=-1
  local minimum_block=$((previous_block + required_new_blocks))

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting for mirror block progress (${label}), minimum block ${minimum_block}"
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    latest_block=$(get_latest_mirror_block_number)
    if [[ "${latest_block}" -ge "${minimum_block}" ]]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Mirror block progress ready (${label}): latest block ${latest_block}"
      return 0
    fi

    echo "Mirror block progress not ready (${label}) [attempt=${attempt}/${max_attempts}, latest=${latest_block}, minimum=${minimum_block}]"
    sleep "${sleep_seconds}"
  done

  echo "Timed out waiting for mirror block progress (${label}); latest=${latest_block}, minimum=${minimum_block}"
  log_and_exit 1
}

function start_sdk_test ()
{
  realm_num="${1:-0}"
  shard_num="${2:-0}"
  result=0
  cd solo
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    curl -sSL "https://github.com/fullstorydev/grpcurl/releases/download/v1.9.3/grpcurl_1.9.3_linux_x86_64.tar.gz" | sudo tar -xz -C /usr/local/bin
  fi
  if command -v grpcurl >/dev/null 2>&1; then
    echo "Run mirror gRPC network node query"
    if command -v timeout >/dev/null 2>&1; then
      timeout 60s grpcurl -plaintext -d '{"file_id": {"shardNum": '"$shard_num"', "realmNum": '"$realm_num"', "fileNum": 102}, "limit": 0}' localhost:38081 com.hedera.mirror.api.proto.NetworkService/getNodes || result=$?
    else
      grpcurl -plaintext -d '{"file_id": {"shardNum": '"$shard_num"', "realmNum": '"$realm_num"', "fileNum": 102}, "limit": 0}' localhost:38081 com.hedera.mirror.api.proto.NetworkService/getNodes || result=$?
    fi
    if [[ $result -ne 0 ]]; then
      echo "grpcurl command failed with exit code $result"
      log_and_exit $result
    fi
    result=0
  else
    echo "grpcurl not found, skipping gRPC connectivity test (install grpcurl to enable)"
  fi
  echo "Run JavaScript SDK topic smoke test"
  if command -v timeout >/dev/null 2>&1; then
    timeout 120s node scripts/create-topic.js || result=$?
  else
    node scripts/create-topic.js || result=$?
  fi
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

function preload_mirror_test_images_for_kind()
{
  local mirror_release="${1:-}"
  local namespace="${2:-}"
  local mirror_context="${3:-${MIRROR_KUBE_CONTEXT}}"
  local hashgraph_mirror_registry="hub.mirror.docker.lat.ope.eng.hashgraph.io"
  local cluster_name
  local node source_image short_image mirror_image
  local hook_images
  local image_prefix source_registry dockerhub_qualified_image
  local kind_nodes
  local max_attempts=3
  local attempt pull_candidate pulled_image
  local -a pull_candidates

  if [ -z "${mirror_release}" ] || [ -z "${namespace}" ]; then
    echo "Skipping mirror test image preload: mirror release or namespace not provided."
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1 || ! command -v kind >/dev/null 2>&1; then
    echo "Skipping mirror test image preload: docker and/or kind not available."
    return 0
  fi

  if [[ "${mirror_context}" != kind-* ]]; then
    echo "Skipping mirror test image preload: mirror context '${mirror_context}' is not kind."
    return 0
  fi

  cluster_name="${mirror_context#kind-}"

  kind_nodes="$(kind get nodes --name "${cluster_name}" 2>/dev/null || true)"
  if [ -z "${kind_nodes}" ]; then
    echo "Warning: unable to resolve kind nodes for cluster ${cluster_name}; skipping test image preload."
    return 0
  fi

  hook_images="$(
    helm get hooks "${mirror_release}" -n "${namespace}" --kube-context "${mirror_context}" 2>/dev/null \
      | awk '
          /^kind: Pod$/ { in_pod = 1 }
          in_pod && $1 == "image:" {
            gsub(/"/, "", $2)
            print $2
          }
          /^---$/ { in_pod = 0 }
        ' \
      | sort -u \
      || true
  )"

  if [ -z "${hook_images}" ]; then
    echo "Warning: no Helm hook pod images found for release '${mirror_release}' in namespace '${namespace}'."
    return 0
  fi

  echo "Preloading mirror acceptance test images into kind cluster '${cluster_name}' via ${hashgraph_mirror_registry}"
  while IFS= read -r source_image; do
    [ -z "${source_image}" ] && continue

    image_prefix="${source_image%%/*}"
    if [[ "${image_prefix}" == *.* || "${image_prefix}" == *:* || "${image_prefix}" == "localhost" ]]; then
      source_registry="${image_prefix}"
      short_image="${source_image#*/}"
    else
      source_registry="docker.io"
      short_image="${source_image}"
    fi

    if [[ "${source_registry}" != "docker.io" && "${source_registry}" != "registry-1.docker.io" ]]; then
      echo "Skipping preload for non-DockerHub hook image ${source_image}"
      continue
    fi

    dockerhub_qualified_image="docker.io/${short_image}"
    mirror_image="${hashgraph_mirror_registry}/${short_image}"
    pull_candidates=(
      "${mirror_image}"
      "${dockerhub_qualified_image}"
      "registry-1.docker.io/${short_image}"
    )

    while IFS= read -r node; do
      [ -z "${node}" ] && continue
      attempt=1
      while [ "${attempt}" -le "${max_attempts}" ]; do
        pulled_image=""
        for pull_candidate in "${pull_candidates[@]}"; do
          if docker exec "${node}" ctr --namespace=k8s.io images pull "${pull_candidate}" >/dev/null 2>&1; then
            pulled_image="${pull_candidate}"
            break
          fi
        done

        if [ -n "${pulled_image}" ]; then
          docker exec "${node}" ctr --namespace=k8s.io images tag "${pulled_image}" "${dockerhub_qualified_image}" >/dev/null 2>&1 || true
          docker exec "${node}" ctr --namespace=k8s.io images tag "${pulled_image}" "${short_image}" >/dev/null 2>&1 || true
          docker exec "${node}" ctr --namespace=k8s.io images tag "${pulled_image}" "${source_image}" >/dev/null 2>&1 || true
          echo "Preloaded ${source_image} on node ${node} from ${pulled_image}"
          break
        fi

        if [ "${attempt}" -eq "${max_attempts}" ]; then
          echo "Warning: failed to preload ${source_image} on ${node} from mirror and Docker Hub fallback after ${max_attempts} attempts."
        else
          echo "Retrying preload ${source_image} on ${node} (attempt ${attempt}/${max_attempts}); trying mirror then Docker Hub fallback..."
          sleep 3
        fi
        attempt=$((attempt + 1))
      done
    done <<< "${kind_nodes}"
  done <<< "${hook_images}"
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
wait_for_contract_test_accounts
latest_mirror_block_before_contract_test="$(get_latest_mirror_block_number)"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Mirror block before smart contract test: ${latest_mirror_block_before_contract_test}"
if [[ "${SMOKE_MIRROR_BLOCK_SETTLE_BLOCKS:-0}" -gt 0 ]]; then
  wait_for_mirror_block_progress "before smart contract test" "${latest_mirror_block_before_contract_test}" "${SMOKE_MIRROR_BLOCK_SETTLE_BLOCKS}" 180 2
else
  echo "Skipping mirror block settle wait before smart contract test"
fi
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
preload_mirror_test_images_for_kind "${mirror_release}" "${SOLO_NAMESPACE}" "${MIRROR_KUBE_CONTEXT}"
result=0
mirror_test_log="mirror_test.log"
echo "Helm test command: helm test ${mirror_release} -n ${SOLO_NAMESPACE} --kube-context ${MIRROR_KUBE_CONTEXT} --timeout 20m"
set +e
helm test "${mirror_release}" -n "${SOLO_NAMESPACE}" --kube-context "${MIRROR_KUBE_CONTEXT}" --timeout 20m 2>&1 | tee "${mirror_test_log}"
result=${PIPESTATUS[0]}
set -e
if [[ $result -ne 0 ]]; then
  echo "------- BEGIN mirror test log -------"
  cat "${mirror_test_log}" || true
  echo "------- END mirror test log -------"
  printf "\r::endgroup::\n"
  log_and_exit $result
fi
echo "Finished mirror node acceptance test on namespace ${SOLO_NAMESPACE}"
printf "\r::endgroup::\n"
