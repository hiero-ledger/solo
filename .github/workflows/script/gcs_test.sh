#!/bin/bash
#set -eo pipefail

source .github/workflows/script/helper.sh

if [ -z "${GCS_ACCESS_KEY}" ]; then
  echo "GCS_ACCESS_KEY is not set. Exiting..."
  exit 1
fi

if [ -z "${GCS_SECRET_KEY}" ]; then
  echo "GCS_SECRET_KEY is not set. Exiting..."
  exit 1
fi

if [ -z "${BUCKET_NAME}" ]; then
  streamBucket="solo-ci-test-streams"
else
  streamBucket=${BUCKET_NAME}
fi

echo "Using bucket name: ${streamBucket}"


echo "Generate GCS credentials to file gcs_values.yaml"
echo "cloud:" > gcs_values.yaml
echo "  buckets:" >> gcs_values.yaml
echo "    streamBucket: ${streamBucket}" >> gcs_values.yaml
echo "  gcs:" >> gcs_values.yaml
echo "    enabled: true" >> gcs_values.yaml
echo '    GCS_ACCESS_KEY: "'${GCS_ACCESS_KEY}'"' >> gcs_values.yaml
echo '    GCS_SECRET_KEY: "'${GCS_SECRET_KEY}'"' >> gcs_values.yaml
echo '    endpoint: "https://storage.googleapis.com"' >> gcs_values.yaml
echo 'minio-server:' >> gcs_values.yaml
echo "  tenant:" >> gcs_values.yaml
echo "    buckets:" >> gcs_values.yaml
echo "      - name: ${streamBucket}" >> gcs_values.yaml
echo "      - name: solo-backups" >> gcs_values.yaml

echo "Generate mirror value file gcs_mirror_values.yaml"
echo "importer:" > gcs_mirror_values.yaml
echo "  config:" >> gcs_mirror_values.yaml
echo "    hedera:" >> gcs_mirror_values.yaml
echo "      mirror:" >> gcs_mirror_values.yaml
echo "        importer:" >> gcs_mirror_values.yaml
echo "          downloader:" >> gcs_mirror_values.yaml
echo "            bucketName: ${streamBucket}" >> gcs_mirror_values.yaml

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"
npm run solo-test -- init
npm run solo-test -- cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
npm run solo-test -- node keys --gossip-keys --tls-keys -i node1,node2
npm run solo-test -- network deploy -i node1,node2 -n "${SOLO_NAMESPACE}" -f gcs_values.yaml
npm run solo-test -- node setup -i node1,node2 -n "${SOLO_NAMESPACE}"
npm run solo-test -- node start -i node1,node2 -n "${SOLO_NAMESPACE}"
npm run solo-test -- mirror-node deploy --namespace "${SOLO_NAMESPACE}" -f gcs_mirror_values.yaml

kubectl port-forward -n "${SOLO_NAMESPACE}" svc/haproxy-node1-svc 50211:50211 > /dev/null 2>&1 &
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/hedera-explorer 8080:80 > /dev/null 2>&1 &

ps -ef |grep port-forward

cd ..; create_test_account ; cd -

echo "-------------------------"
helm get values solo-deployment -n solo-e2e
echo "-------------------------"
helm get values mirror -n solo-e2e
echo "-------------------------"
# echo all pod logs
kubectl describe pods -n solo-e2e
echo "-------------------------"

node examples/create-topic.js

