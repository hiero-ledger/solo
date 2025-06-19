#!/bin/bash
set -euo pipefail

# Update and install prerequisites
apt update && apt install -y curl apt-transport-https gnupg lsb-release git ca-certificates

# Install kubectl v1.33.0
curl -LO https://dl.k8s.io/release/v1.33.0/bin/linux/amd64/kubectl
install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
rm kubectl

# Install nvm and Node 22
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22

# Install Helm 3
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod +x get_helm.sh
./get_helm.sh
rm get_helm.sh

# Install Docker CE
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Clone solo repo and checkout branch
git clone https://github.com/hiero-ledger/solo.git
cd solo
git checkout 2103-add-support-for-loading-the-k8s-context-from-cluster

# Install npm dependencies
npm install

# Extract in-cluster credentials
export TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
export CACERT=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
export SERVER="https://${KUBERNETES_SERVICE_HOST}:${KUBERNETES_SERVICE_PORT}"

# Set up the kubeconfig
kubectl config set-cluster kind-solo-e2e \
  --server="${SERVER}" \
  --certificate-authority="${CACERT}" \
  --embed-certs=true

kubectl config set-credentials kube-admin \
  --token="${TOKEN}"

kubectl config set-context kind-solo-e2e \
  --cluster=kind-solo-e2e \
  --user=kube-admin \
  --namespace=solo-e2e

kubectl config use-context kind-solo-e2e

# Run solo test commands
npm run solo-test -- init
npm run solo-test -- cluster-ref connect --cluster-ref kind-solo-e2e --context kind-solo-e2e
npm run solo-test -- deployment create --deployment solo-e2e --namespace solo-e2e
npm run solo-test -- deployment add-cluster --deployment solo-e2e --cluster-ref kind-solo-e2e --num-consensus-nodes 1
npm run solo-test -- cluster-ref setup --cluster-ref kind-solo-e2e
npm run solo-test -- node keys --gossip-keys --tls-keys --deployment solo-e2e
npm run solo-test -- network deploy --deployment solo-e2e
npm run solo-test -- node setup --deployment solo-e2e -i node1
npm run solo-test -- node start --deployment solo-e2e -i node1