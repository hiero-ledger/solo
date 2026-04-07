node create
Current Command		: consensus network deploy --deployment solo-deployment --release-tag v0.70.0 --pvcs --application-properties /tmp/solo-deployment/application.properties --dev

***

## \*\*\* Home Directories \*\*\*

* /home/runner/.solo
* /home/runner/.solo/logs
* /home/runner/.solo/cache
* /home/runner/.solo/cache/values-files

## \*\*\* Chart Repository \*\*\*

\[ None ]

❯ Check dependencies
❯ Check dependency: helm \[OS: linux, Release: 6.8.0-101-generic, Arch: x64]
❯ Check dependency: kind \[OS: linux, Release: 6.8.0-101-generic, Arch: x64]
❯ Check dependency: kubectl \[OS: linux, Release: 6.8.0-101-generic, Arch: x64]
✔ Check dependency: kind \[OS: linux, Release: 6.8.0-101-generic, Arch: x64]
✔ Check dependency: kubectl \[OS: linux, Release: 6.8.0-101-generic, Arch: x64]
✔ Check dependency: helm \[OS: linux, Release: 6.8.0-101-generic, Arch: x64] \[0.6s]
✔ Check dependencies \[0.6s]
❯ Setup chart manager
✔ Setup chart manager \[0.7s]
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize \[0.2s]
❯ Copy gRPC TLS Certificates
↓ Copy gRPC TLS Certificates \[SKIPPED: Copy gRPC TLS Certificates]
❯ Prepare staging directory
❯ Copy Gossip keys to staging
✔ Copy Gossip keys to staging
❯ Copy gRPC TLS keys to staging
✔ Copy gRPC TLS keys to staging
✔ Prepare staging directory
❯ Copy node keys to secrets
❯ Copy TLS keys
❯ Node: node1, cluster: kind-solo-cluster
❯ Node: node2, cluster: kind-solo-cluster
❯ Copy Gossip keys
❯ Copy Gossip keys
✔ Copy TLS keys
✔ Copy Gossip keys
✔ Node: node1, cluster: kind-solo-cluster
✔ Copy Gossip keys
✔ Node: node2, cluster: kind-solo-cluster
✔ Copy node keys to secrets
❯ Install monitoring CRDs
❯ Pod Logs CRDs
✔ Pod Logs CRDs
❯ Prometheus Operator CRDs

* Installed prometheus-operator-crds chart, version: 24.0.2
  ✔ Prometheus Operator CRDs \[4s]
  ✔ Install monitoring CRDs \[4s]
  ❯ Install chart 'solo-deployment'
* Installed solo-deployment chart, version: 0.62.0
  ✔ Install chart 'solo-deployment' \[2s]
  ❯ Check for load balancer
  ↓ Check for load balancer \[SKIPPED: Check for load balancer]
  ❯ Redeploy chart with external IP address config
  ↓ Redeploy chart with external IP address config \[SKIPPED: Redeploy chart with external IP address config]
  ❯ Check node pods are running
  ❯ Check Node: node1, Cluster: solo-cluster-reference
  ✖ Check Node: node1, Cluster: solo-cluster-reference \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
  ✖ Check node pods are running \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
  \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* ERROR \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*
  Error installing chart solo-deployment
  SoloError: Error installing chart solo-deployment
  at NetworkCommand.deploy (file:///home/runner/\_work/solo/solo/src/commands/network.ts:1509:15)
  at Object.handler (file:///home/runner/\_work/solo/solo/src/core/command-path-builders/command-builder.ts:119:47)
  Caused by: SoloError: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
  at check (file:///home/runner/\_work/solo/solo/src/integration/kube/k8-client/resources/pod/k8-client-pods.ts:213:13)

Caused by: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
SoloError: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
at check (file:///home/runner/\_work/solo/solo/src/integration/kube/k8-client/resources/pod/k8-client-pods.ts:213:13)

\====

one shot podman

error: Metrics API not available
error: Metrics API not available
Error from server (ServiceUnavailable): the server is currently unable to handle the request (get pods.metrics.k8s.io)
1\) Should write log metrics
1 failing

1. One Shot Single E2E Test Suite
   One Shot Single E2E Test
   Should write log metrics:
   Command exit with error code 1, \[command: 'kubectl top pod -A --no-headers=true  '], \[message: 'Error from server (ServiceUnavailable): the server is currently unable to handle the request (get pods.metrics.k8s.io)']
   Error: Executing command: 'kubectl top pod -A --no-headers=true  '
   at ShellRunner.run (/home/runner/work/solo/solo/src/core/shell-runner.ts:27:31)
   at MetricsServerImpl.getClusterMetrics (/home/runner/work/solo/solo/src/business/runtime-state/services/metrics-server-impl.ts:80:57)
   at MetricsServerImpl.getClusterMetrics (/home/runner/work/solo/solo/src/business/runtime-state/services/metrics-server-impl.ts:141:23)
   at MetricsServerImpl.getMetrics (/home/runner/work/solo/solo/src/business/runtime-state/services/metrics-server-impl.ts:52:45)
   at MetricsServerImpl.logMetrics (/home/runner/work/solo/solo/src/business/runtime-state/services/metrics-server-impl.ts:231:50)
   at Context.<anonymous> (/home/runner/work/solo/solo/test/e2e/commands/one-shot-single.test.ts:119:9)
   \===
   node delete

❯ Check for load balancer
↓ Check for load balancer \[SKIPPED: Check for load balancer]
❯ Redeploy chart with external IP address config
↓ Redeploy chart with external IP address config \[SKIPPED: Redeploy chart with external IP address config]
❯ Check node pods are running
❯ Check Node: node1, Cluster: solo-cluster-reference
✖ Check Node: node1, Cluster: solo-cluster-reference \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
✖ Check node pods are running \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* ERROR \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*
Error installing chart solo-deployment
SoloError: Error installing chart solo-deployment
at NetworkCommand.deploy (file:///home/runner/\_work/solo/solo/src/commands/network.ts:1494:15)
at Object.handler (file:///home/runner/\_work/solo/solo/src/core/command-path-builders/command-builder.ts:119:47)

Caused by: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
SoloError: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
at check (file:///home/runner/\_work/solo/solo/src/integration/kube/k8-client/resources/pod/k8-client-pods.ts:213:13)

\=== rapid fire ===

❯ Check for load balancer
↓ Check for load balancer \[SKIPPED: Check for load balancer]
❯ Redeploy chart with external IP address config
↓ Redeploy chart with external IP address config \[SKIPPED: Redeploy chart with external IP address config]
❯ Check node pods are running
❯ Check Node: node1, Cluster: rapid-fire-cluster-reference
✖ Check Node: node1, Cluster: rapid-fire-cluster-reference \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
✖ Check node pods are running \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* ERROR \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*
Error installing chart solo-deployment
SoloError: Error installing chart solo-deployment
at NetworkCommand.deploy (file:///home/runner/\_work/solo/solo/src/commands/network.ts:1494:15)
at Object.handler (file:///home/runner/\_work/solo/solo/src/core/command-path-builders/command-builder.ts:119:47)

Caused by: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
SoloError: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
at check (file:///home/runner/\_work/solo/solo/src/integration/kube/k8-client/resources/pod/k8-client-pods.ts:213:13)

```
=== hard hat

✔ Create Accounts [5s]
```

✔ Check Monitor \[1m12s]
✖ Check Web3 \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Check pods are ready \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ solo mirror node add \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Deploy mirror node and extensions \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Deploy components and create accounts \[FAILED: Pod not ready \[maxAttempts = 300]]
Stopping port-forward for port \[30212]
✖ Check GRPC \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Check Importer \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Check Postgres DB \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Check REST API \[FAILED: Pod not ready \[maxAttempts = 300]]

\==== node jvm ====

❯ Check for load balancer
↓ Check for load balancer \[SKIPPED: Check for load balancer]
❯ Redeploy chart with external IP address config
↓ Redeploy chart with external IP address config \[SKIPPED: Redeploy chart with external IP address config]
❯ Check node pods are running
❯ Check Node: node1, Cluster: solo-5b173d6b
✖ Check Node: node1, Cluster: solo-5b173d6b \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
✖ Check node pods are running \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
✖ solo consensus network deploy \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* ERROR \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*
Error deploying Solo in one-shot mode: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
SoloError: Error deploying Solo in one-shot mode: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
at DefaultOneShotCommand.deployInternal (file:///home/runner/\_work/solo/solo/src/commands/one-shot/default-one-shot.ts:654:13)
at Object.handler (file:///home/runner/\_work/solo/solo/src/core/command-path-builders/command-builder.ts:119:47)

Caused by: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
SoloError: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]
at check (file:///home/runner/\_work/solo/solo/src/integration/kube/k8-client/resources/pod/k8-client-pods.ts:213:13)

```
✔ Check Monitor [1m12s]
```

✖ Check Web3 \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Check pods are ready \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ solo mirror node add \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Deploy mirror node and extensions \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Deploy components and create accounts \[FAILED: Pod not ready \[maxAttempts = 300]]
Stopping port-forward for port \[30212]
✖ Check Importer \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Check Postgres DB \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Check REST API \[FAILED: Pod not ready \[maxAttempts = 300]]
✖ Check GRPC \[FAILED: Pod not ready \[maxAttempts = 300]]
\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* ERROR \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*
Error deploying Solo in one-shot mode: Pod not ready \[maxAttempts = 300]
SoloError: Error deploying Solo in one-shot mode: Pod not ready \[maxAttempts = 300]
at DefaultOneShotCommand.deployInternal (file:///home/runner/\_work/solo/solo/src/commands/one-shot/default-one-shot.ts:654:13)
at Object.handler (file:///home/runner/\_work/solo/solo/src/core/command-path-builders/command-builder.ts:119:47)

Caused by: Pod not ready \[maxAttempts = 300]
SoloError: Pod not ready \[maxAttempts = 300]
at K8ClientPods.waitForReadyStatus (file:///home/runner/\_work/solo/solo/src/integration/kube/k8-client/resources/pod/k8-client-pods.ts:107:13)
at Task.task \[as taskFn] (file:///home/runner/\_work/solo/solo/src/commands/mirror-node.ts:726:17)
at Task.run (file:///home/runner/\_work/solo/solo/node\_modules/listr2/dist/index.mjs:1908:5)

```
Caused by: Expected at least 1 pod not found for labels: app.kubernetes.io/component=web3,app.kubernetes.io/name=web3, phases: Running [attempts = 300/300]
SoloError: Expected at least 1 pod not found for labels: app.kubernetes.io/component=web3,app.kubernetes.io/name=web3, phases: Running [attempts = 300/300]
at check (file:///home/runner/_work/solo/solo/src/integration/kube/k8-client/resources/pod/k8-client-pods.ts:213:13)
```

\=== custeomer network ====

❯ Check for load balancer
↓ Check for load balancer \[SKIPPED: Check for load balancer]
❯ Redeploy chart with external IP address config
↓ Redeploy chart with external IP address config \[SKIPPED: Redeploy chart with external IP address config]
❯ Check node pods are running
❯ Check Node: node1, Cluster: kind-network-with-custom-config-cluster
✖ Check Node: node1, Cluster: kind-network-with-custom-config-cluster \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
✖ Check node pods are running \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]

\==== multiple clsuter save restore

task: \[deploy-external-database] kubectl wait --for=condition=ready pod/my-postgresql-0 \
-n database --timeout=300s

error: timed out waiting for the condition on pods/my-postgresql-0
task: Failed to run task "default": exit status 1

task: \[deploy-mirror-external] kubectl cp /home/runner/.solo/cache/database-seeding-query.sql \
my-postgresql-0:/tmp/database-seeding-query.sql -n database

error: /home/runner/.solo/cache/database-seeding-query.sql doesn't exist in local filesystem
task: Failed to run task "default": exit status 1
Task failed with exit code 201. Collecting deployment diagnostics logs...

\=== save and restore ====

error: timed out waiting for the condition on pods/my-postgresql-0
task: Failed to run task "default": exit status 1
Task failed with exit code 201. Collecting deployment diagnostics logs...

error: timed out waiting for the condition on pods/my-postgresql-0
task: Failed to run task "default": exit status 1
Task failed with exit code 201. Collecting deployment diagnostics logs...

\=== verson upgrade ====

✔ Install explorer \[0.7s]
❯ Install explorer ingress controller
✖ Install explorer ingress controller \[FAILED: failed to upgrade chart explorer-haproxy-ingress-1-namespace-version-upgrade-test: Helm command failed with exit code 1. Command: '/home/runner/.solo/bin/helm upgrade --reuse-values --output json --namespace namespace-version-upgrade-test --kube-context kind-version-upgrade-test-cluster --version 0.14.5  --install  --set fullnameOverride=explorer-haproxy-ingress-1-namespace-version-upgrade-test --set controller.ingressClass=explorer-haproxy-ingress-1-namespace-version-upgrade-test --set controller.extraArgs.controller-class=explorer-haproxy-ingress-1-namespace-version-upgrade-test explorer-haproxy-ingress-1-namespace-version-upgrade-test haproxy-ingress/haproxy-ingress'. Error: Error: release name is invalid: explorer-haproxy-ingress-1-namespace-version-upgrade-test]
\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* ERROR \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*
Error deploying explorer: failed to upgrade chart explorer-haproxy-ingress-1-namespace-version-upgrade-test: Helm command failed with exit code 1. Command: '/home/runner/.solo/bin/helm upgrade --reuse-values --output json --namespace namespace-version-upgrade-test --kube-context kind-version-upgrade-test-cluster --version 0.14.5  --install  --set fullnameOverride=explorer-haproxy-ingress-1-namespace-version-upgrade-test --set controller.ingressClass=explorer-haproxy-ingress-1-namespace-version-upgrade-test --set controller.extraArgs.controller-class=explorer-haproxy-ingress-1-namespace-version-upgrade-test explorer-haproxy-ingress-1-namespace-version-upgrade-test haproxy-ingress/haproxy-ingress'. Error: Error: release name is invalid: explorer-haproxy-ingress-1-namespace-version-upgrade-test

\=== verson upgrade ====

All functionality verification completed successfully!
Forwarding from 127.0.0.1:40840 -> 40840
Forwarding from \[::1]:40840 -> 40840
Handling connection for 40840
E0310 22:03:48.118951   15761 portforward.go:413] "Unhandled Error" err="an error occurred forwarding 40840 -> 40840: error forwarding port 40840 to pod ce73eb2544dfe0f733ff25567f1cb1b2636986f41cdbe47f1e376afd8c33543d, uid : failed to execute portforward in network namespace "/var/run/netns/cni-76da875f-3172-1551-f435-a25572462f80": failed to connect to localhost:40840 inside namespace "ce73eb2544dfe0f733ff25567f1cb1b2636986f41cdbe47f1e376afd8c33543d", IPv4: dial tcp4 127.0.0.1:40840: connect: connection refused IPv6 dial tcp6 \[::1]:40840: connect: connection refused "
error: lost connection to pod

\==== address book ====
❯ Check for load balancer
↓ Check for load balancer \[SKIPPED: Check for load balancer]
❯ Redeploy chart with external IP address config
↓ Redeploy chart with external IP address config \[SKIPPED: Redeploy chart with external IP address config]
❯ Check node pods are running
❯ Check Node: node1, Cluster: solo-f6d87f43
✖ Check Node: node1, Cluster: solo-f6d87f43 \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
✖ Check node pods are running \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]
✖ solo consensus network deploy \[FAILED: Expected at least 1 pod not found for labels: solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node, phases: Running \[attempts = 900/900]]

\==== local build =====

❯ Install explorer ingress controller
✖ Install explorer ingress controller \[FAILED: failed to upgrade chart explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config: Helm command failed with exit code 1. Command: '/home/runner/.solo/bin/helm upgrade --reuse-values --output json --namespace namespace-localbuild-with-custom-config --kube-context kind-localbuild-with-custom-config-cluster --version 0.14.5  --install  --set fullnameOverride=explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config --set controller.ingressClass=explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config --set controller.extraArgs.controller-class=explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config haproxy-ingress/haproxy-ingress'. Error: Error: release name is invalid: explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config]
\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* ERROR \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*
Error deploying explorer: failed to upgrade chart explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config: Helm command failed with exit code 1. Command: '/home/runner/.solo/bin/helm upgrade --reuse-values --output json --namespace namespace-localbuild-with-custom-config --kube-context kind-localbuild-with-custom-config-cluster --version 0.14.5  --install  --set fullnameOverride=explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config --set controller.ingressClass=explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config --set controller.extraArgs.controller-class=explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config haproxy-ingress/haproxy-ingress'. Error: Error: release name is invalid: explorer-haproxy-ingress-1-namespace-localbuild-with-custom-config

***

task: Failed to run task "default": exit status 1
Error: Process completed with exit code 201.

\====network with domain name ======

❯ Install explorer ingress controller
✖ Install explorer ingress controller \[FAILED: failed to upgrade chart explorer-haproxy-ingress-1-namespace-network-with-domain-names: Helm command failed with exit code 1. Command: '/home/runner/.solo/bin/helm upgrade --reuse-values --output json --namespace namespace-network-with-domain-names --kube-context kind-solo-cluster --version 0.14.5  --install  --set fullnameOverride=explorer-haproxy-ingress-1-namespace-network-with-domain-names --set controller.ingressClass=explorer-haproxy-ingress-1-namespace-network-with-domain-names --set controller.extraArgs.controller-class=explorer-haproxy-ingress-1-namespace-network-with-domain-names explorer-haproxy-ingress-1-namespace-network-with-domain-names haproxy-ingress/haproxy-ingress'. Error: Error: release name is invalid: explorer-haproxy-ingress-1-namespace-network-with-domain-names]
\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* ERROR \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*
Error deploying explorer: failed to upgrade chart explorer-haproxy-ingress-1-namespace-network-with-domain-names: Helm command failed with exit code 1. Command: '/home/runner/.solo/bin/helm upgrade --reuse-values --output json --namespace namespace-network-with-domain-names --kube-context kind-solo-cluster --version 0.14.5  --install  --set fullnameOverride=explorer-haproxy-ingress-1-namespace-network-with-domain-names --set controller.ingressClass=explorer-haproxy-ingress-1-namespace-network-with-domain-names --set controller.extraArgs.controller-class=explorer-haproxy-ingress-1-namespace-network-with-domain-names explorer-haproxy-ingress-1-namespace-network-with-domain-names haproxy-ingress/haproxy-ingress'. Error: Error: release name is invalid: explorer-haproxy-ingress-1-namespace-network-with-domain-names

***

task: Failed to run task "default": exit status 1
