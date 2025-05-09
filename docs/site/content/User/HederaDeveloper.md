### Use solo with local build hedera service code

First, please clone hedera service repo `https://github.com/hiero-ledger/hiero-consensus-node/` and build the code
with `./gradlew assemble`. If need to running multiple nodes with different versions or releases, please duplicate the repo or build directories in
multiple directories, checkout to the respective version and build the code.

Then you can start customized built hedera network with the following command:

```bash
SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEVELOPMENT=solo-deployment

kind delete cluster -n "${SOLO_CLUSTER_NAME}" 
kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

solo cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
solo deployment create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEVELOPMENT}"
solo deployment add-cluster --deployment "${SOLO_DEVELOPMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 3

solo node keys --gossip-keys --tls-keys -i node1,node2,node3 
solo network deploy --deployment "${SOLO_DEVELOPMENT}" -i node1,node2,node3 

# option 1) if all nodes are running the same version of Hedera app
solo node setup --deployment "${SOLO_DEVELOPMENT}" -i node1,node2,node3 --local-build-path ../hiero-consensus-node/hedera-node/data/

# option 2) if each node is running different version of Hedera app, please provide different paths to the local repositories
solo node setup --deployment "${SOLO_DEVELOPMENT}" -i node1,node2,node3 --local-build-path node1=../hiero-consensus-node/hedera-node/data/,node1=<path2>,node3=<path3>

solo node start --deployment "${SOLO_DEVELOPMENT}" -i node1,node2,node3 

```

It is possible that different nodes are running different versions of Hedera app, as long as in the above
setup command, each node0, or node1 is given different paths to the local repositories.

If need to provide customized configuration files for Hedera application, please use the following flags with network deploy command:

* `--settings-txt` - to provide custom settings.txt file
* `--api-permission-properties` - to provide custom api-permission.properties file
* `--bootstrap-properties` - to provide custom bootstrap.properties file
* `--application-properties` - to provide custom application.properties file

For example:

```bash
solo network deploy --deployment "${SOLO_DEVELOPMENT}" -i node1,node2,node3 --settings-txt <path-to-settings-txt> 
```
