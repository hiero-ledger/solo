---
title: "Hiero Consensus Node Execution Developer"
weight: 90
description: >
             Use port-forwarding to access Hiero Consensus Node network services.
type: docs
---

## Hiero Consensus Node Execution Developer

Once the nodes are up, you may now expose various services (using `k9s` (shift-f) or `kubectl port-forward`) and access. Below are most used services that you may expose.

* where the 'node name' for Node ID = 0, is `node1` (`node${ nodeId + 1 }`)
* Node services: `network-<node name>-svc`
* HAProxy: `haproxy-<node name>-svc`
  ```bash
  # enable port forwarding for haproxy
  # node1 grpc port accessed by localhost:50211
  kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 51211:50211 &
  # node2 grpc port accessed by localhost:51211
  kubectl port-forward svc/haproxy-node2-svc -n "${SOLO_NAMESPACE}" 52211:50211 &
  # node3 grpc port accessed by localhost:52211
  kubectl port-forward svc/haproxy-node3-svc -n "${SOLO_NAMESPACE}" 53211:50211 &
  ```
* Envoy Proxy: `envoy-proxy-<node name>-svc`
  ```bash
  # enable port forwarding for envoy proxy
  kubectl port-forward svc/envoy-proxy-node1-svc -n "${SOLO_NAMESPACE}" 8181:8080 &
  kubectl port-forward svc/envoy-proxy-node2-svc -n "${SOLO_NAMESPACE}" 8281:8080 &
  kubectl port-forward svc/envoy-proxy-node3-svc -n "${SOLO_NAMESPACE}" 8381:8080 &
  ```
* Hiero explorer: `solo-deployment-hiero-explorer`
  ```bash
  # enable port forwarding for hiero explorer, can be access at http://localhost:8080/
  # check to see if it is already enabled, port forwarding for explorer should be handled by solo automatically
  # kubectl port-forward svc/hiero-explorer-1 -n "${SOLO_NAMESPACE}" 8080:8080 &
  ```
* JSON RPC Relays

You can deploy JSON RPC Relays for one or more nodes as below:

```bash
# deploy relay node first
solo relay node add -i node1 --deployment "${SOLO_DEPLOYMENT}"

# enable relay for node1
# check to see if it is already enabled, port forwarding for relay should be handled by solo automatically
# kubectl port-forward svc/relay-1 -n "${SOLO_NAMESPACE}" 7546:7546 &
```
