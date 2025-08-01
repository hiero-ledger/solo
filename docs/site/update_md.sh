#!/bin/zsh

# can't use quick-start it doesn't have --pvcs
export SOLO_DEPLOYMENT=solo-deployment
export SOLO_CLUSTER_NAME=solo-cluster
export SOLO_CLUSTER_REF=solo-cluster-reference
export SOLO_NAMESPACE=solo-ns
export SOLO_CLUSTER_SETUP_NAMESPACE=${SOLO_NAMESPACE}
export CN_LOCAL_BUILD_PATH=/Users/user/source/hiero-consensus-node/data
export GENESIS_KEY=302e020100300506032b657004220420273389ed26af9c456faa81e9ae4004520130de36e4f534643b7081db21744496

# copied from Solo and then edited as needed, be sure to match the version of Solo:
#  https://github.com/hiero-ledger/solo/blob/v0.41.0/resources/templates/application.properties
export APPLICATION_PROPERTIES=/Users/user/Downloads/application.properties

# just needs to be approximate, if it is main, you can use the next release that it will probably be, this is for decision tree logic
export CN_VERSION=v0.64.1

# the directory to use for Solo to write out the file with the values that are required for the add/update/delete-execute
#  and possibly your SDK calls that replaces *-submit-transaction
export PREPARE_OUTPUT_DIR=/Users/user/Downloads

for cluster in $(kind get clusters);do kind delete cluster -n $cluster;done
rm -Rf ~/.solo

kind create cluster -n "${SOLO_CLUSTER_NAME}"

# running with published version of Solo
# export SOLO_COMMAND='solo'

# running with solo source code
task build
export SOLO_COMMAND='npm run solo --'

# NOTE: the --dev just makes it print a stacktrace to the console if there is an error

solo node start --deployment "${SOLO_DEPLOYMENT}" --release-tag ${CN_VERSION} --dev
solo node add-prepare --deployment "${SOLO_DEPLOYMENT}" --release-tag ${CN_VERSION} --local-build-path ${CN_LOCAL_BUILD_PATH} --dev

${SOLO_COMMAND} init

# connect to the cluster you created in a previous command
${SOLO_COMMAND} cluster-ref connect --cluster-ref ${SOLO_CLUSTER_REF} --context kind-${SOLO_CLUSTER_NAME} --dev

#create the deployment
${SOLO_COMMAND} deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" --dev

# Add a cluster to the deployment you created, we need at least two nodes for node add or node delete.  node update can run with a single node
${SOLO_COMMAND} deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_REF} --num-consensus-nodes 2 --dev

${SOLO_COMMAND} node keys --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" --dev

${SOLO_COMMAND} cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --dev

# The --release-tag here helps for decision tree logic, it isn't installing the CN here
# --pvcs is required for node add/update/delete
${SOLO_COMMAND} network deploy --deployment "${SOLO_DEPLOYMENT}" --release-tag ${CN_VERSION} --pvcs --dev

# node setup, we are doing a local build, but the --release-tag is still used for decision tree logic
${SOLO_COMMAND} node setup --deployment "${SOLO_DEPLOYMENT}" --release-tag ${CN_VERSION} --local-build-path ${CN_LOCAL_BUILD_PATH} --dev

# start your node/nodes, the stake amounts puts a huge percentage on node1 so that it can reach consensus by itself,
#  sort of a workaround to get it to work with 2 nodes instead of 3 due to CN logic
${SOLO_COMMAND} node start --deployment "${SOLO_DEPLOYMENT}" --stake-amounts 1500,1 --dev

# Deploy with explicit configuration
${SOLO_COMMAND} mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress --dev

# deploy explorer
${SOLO_COMMAND} explorer deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev

# relay deployment
${SOLO_COMMAND} relay deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev

# node add
# the --admin-key is setting to genesis, which is the default, but we have a bug that we have logged an issue to fix that causes an error if it isn't supplied

# Option A, node add by itself, useful to verify that Solo is working correctly, used by a normal users not wanting to code the SDK NodeAdd/Update/DeleteTransaction calls
#${SOLO_COMMAND} node add --deployment ${SOLO_DEPLOYMENT} --gossip-keys --tls-keys --admin-key ${GENESIS_KEY} --pvcs true --release-tag v0.63.7 --dev

# Option B, break apart node add so that SDK calls can be made, you will need B.1, B.2a or B.2b, and B.3

# Option B.1, node add-prepare will generate some keys to use, as well as upload a config version bump needed in order to get CN to
#  apply the NodeAdd/Update/DeleteTransaction to the JVM in state memory (runtime)
${SOLO_COMMAND} node add-prepare --deployment "${SOLO_DEPLOYMENT}" --gossip-keys true --tls-keys true --release-tag ${CN_VERSION} --output-dir ${PREPARE_OUTPUT_DIR} --admin-key ${GENESIS_KEY} --pvcs true --dev

# Option B.2a is for Solo testing, Option 2.2b is for SDK team

# Option B.2a, node add-submit-transaction, this is essentially what you will replace with Option B, but it is what Solo runs in our test harness, and solo node add = solo node {add-prepare + add-submit-transaction + add-execute}
${SOLO_COMMAND} node add-submit-transaction --deployment "${SOLO_DEPLOYMENT}" --input-dir ${PREPARE_OUTPUT_DIR} --dev

# Option B.2b.1, this is where you add your SDK call
# ... example: `node node-add-transaction.cjs`

# Option B.2b.2, tell CN to prepare for freeze
# ${SOLO_COMMAND} node prepare-upgrade --deployment "${SOLO_DEPLOYMENT}" --dev

# Option B.2b.3, tell CN to freeze, which will cause it to block new transactions, finish existing transactions, and write out certain files
# ${SOLO_COMMAND} node freeze-upgrade --deployment "${SOLO_DEPLOYMENT}" --dev

# Option B.3, node add-execute, applies configuration files, keys, etc; installs software on new node; restarts the JVMs
${SOLO_COMMAND} node add-execute --deployment "${SOLO_DEPLOYMENT}" --input-dir ${PREPARE_OUTPUT_DIR} --dev

# PORT FORWARDS: if you need them, most is automatic now, see comments

# Consensus Service for node1 (node ID = 0): localhost:50211, port-forward for this port is automatic in Solo in v0.40+
#kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211 > /dev/null 2>&1 &
# Explorer UI: http://localhost:8080, port-forward for this port is automatic in Solo in v0.40+
#kubectl port-forward svc/hiero-explorer -n "${SOLO_NAMESPACE}" 8080:80 > /dev/null 2>&1 &
# JSON RPC Relay: localhost:7546, port-forward for this port is automatic in Solo in v0.40+
#kubectl port-forward svc/relay-node1-hedera-json-rpc-relay -n "${SOLO_NAMESPACE}" 7546:7546 > /dev/null 2>&1 &
# NOTE: with mirror-node `--enable-ingress`, it will open up port 8081 as a port-forward which will have all of the
#  mirror node components like in MAINNET: mirror-grpc, mirror-rest, mirror-web3, mirror-restjava

# if you still want to have separate ports, you can do this manually
# Mirror Node gRPC: localhost:5600
kubectl port-forward svc/mirror-grpc -n "${SOLO_NAMESPACE}" 5600:5600 &
# Mirror Node REST API: http://localhost:5551
kubectl port-forward svc/mirror-rest -n "${SOLO_NAMESPACE}" svc/mirror-rest 5551:80 &
# Mirror Node REST Java API http://localhost:8084
kubectl port-forward svc/mirror-restjava -n "${SOLO_NAMESPACE}" 8084:80 &

# command to see what port-forwards are running
ps -ef | grep port-forward | grep -v grep
