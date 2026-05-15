// SPDX-License-Identifier: Apache-2.0

export const ErrorCodeRegistry: Record<string, string> = {
  // 1xxx - Configuration: Deployment config, schema, existence checks
  LOCAL_CONFIG_NOT_FOUND: 'SOLO-1001',
  REMOTE_CONFIGS_MISMATCH: 'SOLO-1012',

  // 2xxx - Deployment / Infrastructure: Cluster, namespace, pod lifecycle
  CREATE_DEPLOYMENT: 'SOLO-2001',
  DEPLOYMENT_NAME_ALREADY_EXISTS: 'SOLO-2002',
  DEPLOYMENT_NOT_FOUND: 'SOLO-2003',
  DEPLOYMENT_HAS_REMOTE_RESOURCES: 'SOLO-2004',
  DEPLOYMENT_DELETE_FAILED: 'SOLO-2005',
  CLUSTER_ADD_FAILED: 'SOLO-2006',
  DEPLOYMENT_LIST_FAILED: 'SOLO-2007',
  CLUSTER_REF_NOT_FOUND: 'SOLO-2008',
  CLUSTER_REF_ALREADY_EXISTS: 'SOLO-2009',
  NAMESPACE_NOT_SET: 'SOLO-2010',
  NO_CLUSTERS_FOR_DEPLOYMENT: 'SOLO-2011',
  CLUSTER_REFERENCE_RESOLUTION_FAILED: 'SOLO-2012',
  CONTEXT_NOT_FOUND_FOR_CLUSTER: 'SOLO-2013',
  NO_DEPLOYMENTS_FOUND: 'SOLO-2014',
  DEPLOYMENT_LIST_PORTS_FAILED: 'SOLO-2015',

  // 3xxx - Component: Relay, Mirror Node, Explorer, CN runtime

  // 4xxx - Validation: User input, flags, IDs, formatting

  // 5xxx - System / Environment: kubectl, DNS, permissions, timeouts

  // 9xxx - Internal: Unexpected bugs, unimplemented paths
  TIMEOUT: 'SOLO-9001',
} as const;
