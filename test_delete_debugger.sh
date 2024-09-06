#!/usr/bin/env bash

./test/e2e/setup-e2e.sh

solo network deploy -i node1,node2,node3,node4

solo node keys --gossip-keys --tls-keys

solo node setup -i node1,node2,node3,node4 --local-build-path ../hedera-services/hedera-node/data

solo node start -i node1,node2,node3,node4

solo node delete --node-id node2  --debug-nodeid node3

