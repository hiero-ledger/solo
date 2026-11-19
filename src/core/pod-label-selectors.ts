// SPDX-License-Identifier: Apache-2.0

// Kubernetes label selectors Solo uses to find the pods of each component it deploys.
export const SOLO_RELAY_NAME_LABEL: string = 'app.kubernetes.io/name=relay';
export const SOLO_MIRROR_IMPORTER_NAME_LABEL: string = 'app.kubernetes.io/name=importer';
export const SOLO_MIRROR_PINGER_NAME_LABEL: string = 'app.kubernetes.io/name=pinger';
export const SOLO_MIRROR_GRPC_NAME_LABEL: string = 'app.kubernetes.io/name=grpc';
export const SOLO_MIRROR_MONITOR_NAME_LABEL: string = 'app.kubernetes.io/name=monitor';
export const SOLO_MIRROR_REST_NAME_LABEL: string = 'app.kubernetes.io/name=rest';
export const SOLO_MIRROR_WEB3_NAME_LABEL: string = 'app.kubernetes.io/name=web3';
export const SOLO_MIRROR_POSTGRES_NAME_LABEL: string = 'app.kubernetes.io/name=postgres';
export const SOLO_MIRROR_REDIS_NAME_LABEL: string = 'app.kubernetes.io/name=redis';
export const SOLO_MIRROR_RESTJAVA_NAME_LABEL: string = 'app.kubernetes.io/name=restjava';
export const SOLO_BLOCK_NODE_NAME_LABEL: string = 'block-node.hiero.com/type=block-node';
export const SOLO_INGRESS_CONTROLLER_NAME_LABEL: string = 'app.kubernetes.io/name=haproxy-ingress';
export const SOLO_EXPLORER_LABEL: string = 'app.kubernetes.io/component=hiero-explorer';
export const NETWORK_LOAD_GENERATOR_POD_LABELS: string[] = [
  'app.kubernetes.io/instance=network-load-generator',
  'app.kubernetes.io/name=network-load-generator',
];
