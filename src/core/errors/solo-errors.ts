// SPDX-License-Identifier: Apache-2.0

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
import {DataValidationError} from './classes/validation/data-validation-error.js';
import {IllegalArgumentError} from './classes/validation/illegal-argument-error.js';
import {MissingArgumentError} from './classes/validation/missing-argument-error.js';
import {ConsensusNodeCountRequiredError} from './classes/validation/consensus-node-count-required-error.js';
import {InvalidOutputFormatError} from './classes/validation/invalid-output-format-error.js';
import {InvalidPortNumberError} from './classes/validation/invalid-port-number-error.js';
import {ClusterConnectionFailedError} from './classes/system/cluster-connection-failed-error.js';
import {PortForwardRefreshFailedError} from './classes/system/port-forward-refresh-failed-error.js';
import {PortForwardStatusFailedError} from './classes/system/port-forward-status-failed-error.js';
import {ResourceNotFoundError} from './classes/system/resource-not-found-error.js';
import {LocalConfigNotFoundSoloError} from './classes/config/local-config-not-found-solo-error.js';
import {ReadRemoteConfigBeforeLoadError} from './classes/config/read-remote-config-before-load-error.js';
import {RefreshLocalConfigSourceError} from './classes/config/refresh-local-config-source-error.js';
import {RemoteConfigsMismatchSoloError} from './classes/config/remote-configs-mismatch-solo-error.js';
import {WriteLocalConfigFileError} from './classes/config/write-local-config-file-error.js';
import {WriteRemoteConfigBeforeLoadError} from './classes/config/write-remote-config-before-load-error.js';
import {UnsupportedOperationError} from './classes/internal/unsupported-operation-error.js';
import {CreateDeploymentSoloError} from './classes/deployment/create-deployment-solo-error.js';
import {DeploymentAlreadyExistsSoloError} from './classes/deployment/deployment-already-exists-solo-error.js';
import {RapidFireExecutionSoloError} from './classes/rapid-fire-execution-solo-error.js';

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
  // 1xxx - Configuration: Local/remote config lifecycle
  public static readonly config: {
    readonly localNotFound: typeof LocalConfigNotFoundSoloError;
    readonly readRemoteConfigBeforeLoad: typeof ReadRemoteConfigBeforeLoadError;
    readonly refreshLocalConfigSource: typeof RefreshLocalConfigSourceError;
    readonly remoteMismatch: typeof RemoteConfigsMismatchSoloError;
    readonly writeLocalConfig: typeof WriteLocalConfigFileError;
    readonly writeRemoteConfigBeforeLoad: typeof WriteRemoteConfigBeforeLoadError;
  } = Object.freeze({
    localNotFound: LocalConfigNotFoundSoloError,
    readRemoteConfigBeforeLoad: ReadRemoteConfigBeforeLoadError,
    refreshLocalConfigSource: RefreshLocalConfigSourceError,
    remoteMismatch: RemoteConfigsMismatchSoloError,
    writeLocalConfig: WriteLocalConfigFileError,
    writeRemoteConfigBeforeLoad: WriteRemoteConfigBeforeLoadError,
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
  public static readonly component: {
    readonly rapidFireExecutionFailed: typeof RapidFireExecutionSoloError;
  } = Object.freeze({
    rapidFireExecutionFailed: RapidFireExecutionSoloError,
  });

  // 4xxx — Validation: User input, flags, IDs, formatting
  public static readonly validation: {
    readonly consensusNodeCountRequired: typeof ConsensusNodeCountRequiredError;
    readonly dataValidation: typeof DataValidationError;
    readonly illegalArgument: typeof IllegalArgumentError;
    readonly invalidOutputFormat: typeof InvalidOutputFormatError;
    readonly invalidPortNumber: typeof InvalidPortNumberError;
    readonly missingArgument: typeof MissingArgumentError;
  } = Object.freeze({
    consensusNodeCountRequired: ConsensusNodeCountRequiredError,
    dataValidation: DataValidationError,
    illegalArgument: IllegalArgumentError,
    invalidOutputFormat: InvalidOutputFormatError,
    invalidPortNumber: InvalidPortNumberError,
    missingArgument: MissingArgumentError,
  });

  // 5xxx — System / Environment: kubectl, DNS, permissions, timeouts
  public static readonly system: {
    readonly clusterConnectionFailed: typeof ClusterConnectionFailedError;
    readonly portForwardRefreshFailed: typeof PortForwardRefreshFailedError;
    readonly portForwardStatusFailed: typeof PortForwardStatusFailedError;
    readonly resourceNotFound: typeof ResourceNotFoundError;
  } = Object.freeze({
    clusterConnectionFailed: ClusterConnectionFailedError,
    portForwardRefreshFailed: PortForwardRefreshFailedError,
    portForwardStatusFailed: PortForwardStatusFailedError,
    resourceNotFound: ResourceNotFoundError,
  });

  // 9xxx — Internal: Unexpected bugs, unimplemented paths
  public static readonly internal: {
    readonly unsupportedOperation: typeof UnsupportedOperationError;
  } = Object.freeze({
    unsupportedOperation: UnsupportedOperationError,
  });
}
