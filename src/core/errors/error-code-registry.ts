// SPDX-License-Identifier: Apache-2.0

export const ErrorCodeRegistry: Record<string, string> = {
  // 1xxx - Configuration: Deployment config, schema, existence checks
  LOCAL_CONFIG_NOT_FOUND: 'SOLO-1001',
  REMOTE_CONFIGS_MISMATCH: 'SOLO-1012',

  // 2xxx - Deployment / Infrastructure: Cluster, namespace, pod lifecycle
  CREATE_DEPLOYMENT: 'SOLO-2001',
  DEPLOYMENT_NAME_ALREADY_EXISTS: 'SOLO-2002',

  // 3xxx - Component: Relay, Mirror Node, Explorer, CN runtime

  // 4xxx - Validation: User input, flags, IDs, formatting

  // 5xxx - System / Environment: kubectl, DNS, permissions, timeouts

  // 9xxx - Internal: Unexpected bugs, unimplemented paths
  TIMEOUT: 'SOLO-9001',
} as const;
