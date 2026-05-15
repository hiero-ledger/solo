// SPDX-License-Identifier: Apache-2.0

import {CreateDeploymentSoloError} from './classes/deployment/create-deployment-solo-error.js';
import {DeploymentAlreadyExistsSoloError} from './classes/deployment/deployment-already-exists-solo-error.js';
import {LocalConfigNotFoundSoloError} from './classes/local-config-not-found-solo-error.js';
import {RemoteConfigsMismatchSoloError} from './classes/remote-configs-mismatch-solo-error.js';
import {ClusterAddFailedError} from './classes/deployment/cluster-add-failed-error.js';
import {ClusterReferenceAlreadyExistsError} from './classes/deployment/cluster-reference-already-exists-error.js';
import {ClusterReferenceNotFoundError} from './classes/deployment/cluster-reference-not-found-error.js';
import {ClusterReferenceResolutionFailedError} from './classes/deployment/cluster-reference-resolution-failed-error.js';
import {ContextNotFoundForClusterError} from './classes/deployment/context-not-found-for-cluster-error.js';
import {DeploymentDeleteFailedError} from './classes/deployment/deployment-delete-failed-error.js';
import {DeploymentHasRemoteResourcesError} from './classes/deployment/deployment-has-remote-resources-error.js';
import {DeploymentListFailedError} from './classes/deployment/deployment-list-failed-error.js';
import {DeploymentListPortsFailedError} from './classes/deployment/deployment-list-ports-failed-error.js';
import {DeploymentNotFoundError} from './classes/deployment/deployment-not-found-error.js';
import {NamespaceNotSetError} from './classes/deployment/namespace-not-set-error.js';
import {NoClustersForDeploymentError} from './classes/deployment/no-clusters-for-deployment-error.js';
import {NoDeploymentsFoundError} from './classes/deployment/no-deployments-found-error.js';

/**
 * Registry of typed Solo error constructors, grouped by error code category.
 *
 * To add a new error type:
 * 1. Create `src/core/errors/classes/<category>/<kebab-name>.ts` — a class extending SoloError,
 *    passing a SoloErrorInit with a message, code, and optional troubleshootingSteps.
 * 2. Add the error code constant to `src/core/errors/error-code-registry.ts`.
 * 3. Import the class in this file and add it to the appropriate static namespace below.
 */
export class SoloErrors {
  // 1xxx - Configuration: Deployment config, schema, existence checks
  public static readonly config: {
    readonly localNotFound: typeof LocalConfigNotFoundSoloError;
    readonly remoteMismatch: typeof RemoteConfigsMismatchSoloError;
  } = Object.freeze({
    localNotFound: LocalConfigNotFoundSoloError,
    remoteMismatch: RemoteConfigsMismatchSoloError,
  });

  // 2xxx - Deployment / Infrastructure: Cluster, namespace, pod lifecycle
  public static readonly deployment: {
    readonly alreadyExists: typeof DeploymentAlreadyExistsSoloError;
    readonly clusterAddFailed: typeof ClusterAddFailedError;
    readonly clusterRefAlreadyExists: typeof ClusterReferenceAlreadyExistsError;
    readonly clusterRefNotFound: typeof ClusterReferenceNotFoundError;
    readonly clusterReferenceResolutionFailed: typeof ClusterReferenceResolutionFailedError;
    readonly contextNotFoundForCluster: typeof ContextNotFoundForClusterError;
    readonly createFailed: typeof CreateDeploymentSoloError;
    readonly deleteFailed: typeof DeploymentDeleteFailedError;
    readonly hasRemoteResources: typeof DeploymentHasRemoteResourcesError;
    readonly listFailed: typeof DeploymentListFailedError;
    readonly listPortsFailed: typeof DeploymentListPortsFailedError;
    readonly namespaceNotSet: typeof NamespaceNotSetError;
    readonly noClustersForDeployment: typeof NoClustersForDeploymentError;
    readonly noDeploymentsFound: typeof NoDeploymentsFoundError;
    readonly notFound: typeof DeploymentNotFoundError;
  } = Object.freeze({
    alreadyExists: DeploymentAlreadyExistsSoloError,
    clusterAddFailed: ClusterAddFailedError,
    clusterRefAlreadyExists: ClusterReferenceAlreadyExistsError,
    clusterRefNotFound: ClusterReferenceNotFoundError,
    clusterReferenceResolutionFailed: ClusterReferenceResolutionFailedError,
    contextNotFoundForCluster: ContextNotFoundForClusterError,
    createFailed: CreateDeploymentSoloError,
    deleteFailed: DeploymentDeleteFailedError,
    hasRemoteResources: DeploymentHasRemoteResourcesError,
    listFailed: DeploymentListFailedError,
    listPortsFailed: DeploymentListPortsFailedError,
    namespaceNotSet: NamespaceNotSetError,
    noClustersForDeployment: NoClustersForDeploymentError,
    noDeploymentsFound: NoDeploymentsFoundError,
    notFound: DeploymentNotFoundError,
  });

  // 3xxx — Component: Relay, Mirror Node, Explorer, CN runtime
  public static readonly component: Record<string, never> = Object.freeze({});

  // 4xxx — Validation: User input, flags, IDs, formatting
  public static readonly validation: Record<string, never> = Object.freeze({});

  // 5xxx — System / Environment: kubectl, DNS, permissions, timeouts
  public static readonly system: Record<string, never> = Object.freeze({});

  // 9xxx — Internal: Unexpected bugs, unimplemented paths
  public static readonly internal: Record<string, never> = Object.freeze({});
}
