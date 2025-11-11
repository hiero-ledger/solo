#!/bin/bash
set -eo pipefail

function create_test_account ()
{
  echo "Create test account with solo network"
  cd solo
  DEPLOYMENT_NAME=$1
  echo "DEPLOYMENT_NAME=${DEPLOYMENT_NAME}"
  # create new account and extract account id
  npm run solo-test -- init
  npm run solo-test -- ledger account create --deployment "${DEPLOYMENT_NAME}" --hbar-amount 10000 --generate-ecdsa-key --set-alias > test.log
  export OPERATOR_ID=$(grep \"accountId\" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "OPERATOR_ID=${OPERATOR_ID}"
  rm test.log

  # get private key of the account
  npm run solo-test -- ledger account info --deployment "${DEPLOYMENT_NAME}" --account-id "${OPERATOR_ID}" --private-key > test.log

  # retrieve the field privateKey but not privateKeyRaw
  export OPERATOR_KEY=$(grep \"privateKey\" test.log | grep -v "privateKeyRaw" | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  export CONTRACT_TEST_KEY_ONE=0x$(grep \"privateKeyRaw\" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "CONTRACT_TEST_KEY_ONE=${CONTRACT_TEST_KEY_ONE}"
  rm test.log

  npm run solo-test -- ledger account create --deployment "${DEPLOYMENT_NAME}" --hbar-amount 10000 --generate-ecdsa-key --set-alias > test.log
  export SECOND_KEY=$(grep \"accountId\" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  npm run solo-test -- ledger account info --deployment "${DEPLOYMENT_NAME}" --account-id ${SECOND_KEY} --private-key > test.log
  export CONTRACT_TEST_KEY_TWO=0x$(grep \"privateKeyRaw\" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "CONTRACT_TEST_KEY_TWO=${CONTRACT_TEST_KEY_TWO}"
  rm test.log

  export CONTRACT_TEST_KEYS=${CONTRACT_TEST_KEY_ONE},$'\n'${CONTRACT_TEST_KEY_TWO}
  export HEDERA_NETWORK="local-node"

  echo "OPERATOR_KEY=${OPERATOR_KEY}"
  echo "HEDERA_NETWORK=${HEDERA_NETWORK}"
  echo "CONTRACT_TEST_KEYS=${CONTRACT_TEST_KEYS}"

  cd -
}

function log_and_exit()
{
  if [ -z "${SOLO_NAMESPACE}" ]; then
    echo "SOLO_NAMESPACE is not set. Exiting."
    exit 1
  fi
  echo "load_log_and_exit begin with rc=$1"

  printf "\r::group::Relay log dump\n"
  echo "------- BEGIN RELAY DUMP -------"
  kubectl get services -n "${SOLO_NAMESPACE}" --output=name | grep relay-1 | grep -v '\-ws' | xargs -IRELAY kubectl logs -n "${SOLO_NAMESPACE}" RELAY > relay.log || true
  echo "------- END RELAY DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  printf "\r::group::Mirror REST log dump\n"
  echo "------- BEGIN MIRROR REST DUMP -------"
  kubectl get services -n "${SOLO_NAMESPACE}" --output=name | grep rest | grep -v '\-restjava' | xargs -IREST kubectl logs -n "${SOLO_NAMESPACE}" REST > rest.log || true
  echo "------- END MIRROR REST DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  printf "\r::group::Mirror gRPC log dump\n"
  echo "------- BEGIN MIRROR GRPC DUMP -------"
  kubectl get services -n "${SOLO_NAMESPACE}" --output=name | grep grpc | xargs -IGRPC kubectl logs -n "${SOLO_NAMESPACE}" GRPC > grpc.log || true
  echo "------- END MIRROR GRPC DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  printf "\r::group::Mirror Importer log dump\n"
  echo "------- BEGIN MIRROR IMPORTER DUMP -------"
  kubectl get pods -n "${SOLO_NAMESPACE}" --output=name | grep importer | xargs -IIMPORTER kubectl logs -n "${SOLO_NAMESPACE}" IMPORTER > importer.log || true
  echo "------- END MIRROR IMPORTER DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  printf "\r::group::Mirror Monitor log dump\n"
  echo "------- BEGIN LOG DUMP -------"
  kubectl get pods -n "${namespace}"  --output=name | grep mirror-monitor | xargs -IPOD kubectl logs -n "${namespace}" POD > mirror-monitor.log || true
  echo "------- END LOG DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  printf "\r::group::Port-forward log dump\n"
  echo "------- Last port-forward check -------" >> port-forward.log
  ps -ef |grep port-forward >> port-forward.log
  printf "\r::endgroup::\n"

  printf "\r::group::Block Node log dump\n"
  echo "------- BEGIN BLOCK NODE DUMP -------"
  kubectl logs -n "${SOLO_NAMESPACE}" block-node-1-0 -c block-node-server > blocker.log || true
  kubectl logs -n "${SOLO_NAMESPACE}" block-node-1-0 -c block-node-server --previous > blocker_prev.log || true
  echo "------- END BLOCK NODE DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  cp relay.log rest.log importer.log port-forward.log grpc.log mirror-monitor.log "$HOME"/.solo/logs/ || true
  if [ -f blocker_prev.log ]; then
    cp blocker_prev.log "$HOME"/.solo/logs/ || true
  fi

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
