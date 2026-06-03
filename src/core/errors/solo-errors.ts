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
import {DataValidationError} from './classes/internal/data-validation-error.js';
import {IllegalArgumentError} from './classes/validation/illegal-argument-error.js';
import {MissingArgumentError} from './classes/validation/missing-argument-error.js';
import {ConsensusNodeCountRequiredError} from './classes/validation/consensus-node-count-required-error.js';
import {InvalidOutputFormatError} from './classes/validation/invalid-output-format-error.js';
import {InvalidPortNumberError} from './classes/validation/invalid-port-number-error.js';
import {ClusterConnectionFailedError} from './classes/system/cluster-connection-failed-error.js';
import {GitHubApiHttpResponseError} from './classes/system/github-api-http-response-error.js';
import {GitHubApiRequestFailedError} from './classes/system/github-api-request-failed-error.js';
import {GitHubApiResponseMissingTagNameError} from './classes/system/github-api-response-missing-tag-name-error.js';
import {GitHubApiResponseParseFailedError} from './classes/system/github-api-response-parse-failed-error.js';
import {PortForwardRefreshFailedError} from './classes/system/port-forward-refresh-failed-error.js';
import {PortForwardStatusFailedError} from './classes/system/port-forward-status-failed-error.js';
import {ResourceNotFoundError} from './classes/system/resource-not-found-error.js';
import {LocalConfigNotFoundSoloError} from './classes/config/local-config-not-found-solo-error.js';
import {ReadRemoteConfigBeforeLoadError} from './classes/internal/read-remote-config-before-load-error.js';
import {RefreshLocalConfigSourceError} from './classes/config/refresh-local-config-source-error.js';
import {RemoteConfigsMismatchSoloError} from './classes/config/remote-configs-mismatch-solo-error.js';
import {WriteLocalConfigFileError} from './classes/config/write-local-config-file-error.js';
import {WriteRemoteConfigBeforeLoadError} from './classes/internal/write-remote-config-before-load-error.js';
import {BlockNodeAddExternalFailedSoloError} from './classes/component/block-node-add-external-failed-solo-error.js';
import {BlockNodeConfigFailedSoloError} from './classes/component/block-node-config-failed-solo-error.js';
import {BlockNodeDeleteExternalFailedSoloError} from './classes/component/block-node-delete-external-failed-solo-error.js';
import {BlockNodeDeployFailedSoloError} from './classes/component/block-node-deploy-failed-solo-error.js';
import {BlockNodeDestroyFailedSoloError} from './classes/component/block-node-destroy-failed-solo-error.js';
import {BlockNodeHealthCheckFailedSoloError} from './classes/component/block-node-health-check-failed-solo-error.js';
import {BlockNodeUpgradeFailedSoloError} from './classes/component/block-node-upgrade-failed-solo-error.js';
import {ChartInstallFailedSoloError} from './classes/component/chart-install-failed-solo-error.js';
import {NetworkDestroyFailedSoloError} from './classes/component/network-destroy-failed-solo-error.js';
import {NodeBuildCopyFailedSoloError} from './classes/component/node-build-copy-failed-solo-error.js';
import {NodeBuildUploadFailedSoloError} from './classes/component/node-build-upload-failed-solo-error.js';
import {NodeDebugArchiveFailedSoloError} from './classes/component/node-debug-archive-failed-solo-error.js';
import {NodeJfrExecutionFailedSoloError} from './classes/component/node-jfr-execution-failed-solo-error.js';
import {NodeJfrPidNotFoundSoloError} from './classes/component/node-jfr-pid-not-found-solo-error.js';
import {NodeNotReadySoloError} from './classes/component/node-not-ready-solo-error.js';
import {NodeTransactionFailedSoloError} from './classes/component/node-transaction-failed-solo-error.js';
import {NodeStakeTransactionErrorSoloError} from './classes/component/node-stake-transaction-error-solo-error.js';
import {NodePrepareUpgradeTransactionErrorSoloError} from './classes/component/node-prepare-upgrade-transaction-error-solo-error.js';
import {NodeFreezeUpgradeTransactionErrorSoloError} from './classes/component/node-freeze-upgrade-transaction-error-solo-error.js';
import {NodeFreezeTransactionErrorSoloError} from './classes/component/node-freeze-transaction-error-solo-error.js';
import {NodeUpdateTransactionErrorSoloError} from './classes/component/node-update-transaction-error-solo-error.js';
import {NodeDeleteTransactionErrorSoloError} from './classes/component/node-delete-transaction-error-solo-error.js';
import {NodeCreateTransactionErrorSoloError} from './classes/component/node-create-transaction-error-solo-error.js';
import {AccountBalanceQueryFailedSoloError} from './classes/component/account-balance-query-failed-solo-error.js';
import {ConfigFileNotFoundSoloError} from './classes/validation/config-file-not-found-solo-error.js';
import {GrpcEndpointsRequiredSoloError} from './classes/validation/grpc-endpoints-required-solo-error.js';
import {InputDirectoryNotSpecifiedSoloError} from './classes/validation/input-directory-not-specified-solo-error.js';
import {LocalBuildMissingSubdirectoriesSoloError} from './classes/validation/local-build-missing-subdirectories-solo-error.js';
import {LocalBuildNoJarFilesSoloError} from './classes/validation/local-build-no-jar-files-solo-error.js';
import {LocalBuildPathNotFoundSoloError} from './classes/validation/local-build-path-not-found-solo-error.js';
import {NodeJarFilesNotInContainerSoloError} from './classes/validation/node-jar-files-not-in-container-solo-error.js';
import {NodeVersionMismatchSoloError} from './classes/validation/node-version-mismatch-solo-error.js';
import {NonInteractivePromptSoloError} from './classes/validation/non-interactive-prompt-solo-error.js';
import {OutputDirectoryNotSpecifiedSoloError} from './classes/validation/output-directory-not-specified-solo-error.js';
import {PvcFlagNotEnabledSoloError} from './classes/validation/pvc-flag-not-enabled-solo-error.js';
import {RealmShardVersionConstraintSoloError} from './classes/validation/realm-shard-version-constraint-solo-error.js';
import {UpgradeVersionNotFoundSoloError} from './classes/validation/upgrade-version-not-found-solo-error.js';
import {WrapsKeyPathNotFoundSoloError} from './classes/validation/wraps-key-path-not-found-solo-error.js';
import {WrapsVersionConstraintSoloError} from './classes/validation/wraps-version-constraint-solo-error.js';
import {ClusterReferenceUndeterminedSoloError} from './classes/system/cluster-reference-undetermined-solo-error.js';
import {ConsensusNodeNotInConfigSoloError} from './classes/system/consensus-node-not-in-config-solo-error.js';
import {GrpcProxyEndpointFailedSoloError} from './classes/system/grpc-proxy-endpoint-failed-solo-error.js';
import {HaproxyPodsNotFoundSoloError} from './classes/system/haproxy-pods-not-found-solo-error.js';
import {K8sSecretCreateFailedSoloError} from './classes/system/k8s-secret-create-failed-solo-error.js';
import {KubeContextNotFoundSoloError} from './classes/system/kube-context-not-found-solo-error.js';
import {LoadBalancerNotFoundSoloError} from './classes/system/load-balancer-not-found-solo-error.js';
import {MultipleDeploymentsFoundSoloError} from './classes/system/multiple-deployments-found-solo-error.js';
import {NamespaceNotFoundSoloError} from './classes/system/namespace-not-found-solo-error.js';
import {NoPvcFoundSoloError} from './classes/system/no-pvc-found-solo-error.js';
import {PodNotFoundSoloError} from './classes/system/pod-not-found-solo-error.js';
import {PortForwardMissingSoloError} from './classes/system/port-forward-missing-solo-error.js';
import {StatesDirectoryNotFoundSoloError} from './classes/system/states-directory-not-found-solo-error.js';
import {UpgradeVersionFetchFailedSoloError} from './classes/system/upgrade-version-fetch-failed-solo-error.js';
import {UnsupportedOperationError} from './classes/internal/unsupported-operation-error.js';
import {CreateDeploymentSoloError} from './classes/deployment/create-deployment-solo-error.js';
import {DeploymentAlreadyExistsSoloError} from './classes/deployment/deployment-already-exists-solo-error.js';
import {RapidFireExecutionSoloError} from './classes/rapid-fire-execution-solo-error.js';
import {StateFilePathNotFoundSoloError} from './classes/validation/state-file-path-not-found-solo-error.js';
import {StateFileNotFoundSoloError} from './classes/validation/state-file-not-found-solo-error.js';
import {InvalidStateFileFormatSoloError} from './classes/validation/invalid-state-file-format-solo-error.js';
import {InvalidStateZipFileNameSoloError} from './classes/validation/invalid-state-zip-file-name-solo-error.js';
import {ExplorerDeployFailedSoloError} from './classes/component/explorer-deploy-failed-solo-error.js';
import {ExplorerUpgradeFailedSoloError} from './classes/component/explorer-upgrade-failed-solo-error.js';
import {ExplorerDestroyFailedSoloError} from './classes/component/explorer-destroy-failed-solo-error.js';
import {RelayDeployFailedSoloError} from './classes/component/relay-deploy-failed-solo-error.js';
import {RelayUpgradeFailedSoloError} from './classes/component/relay-upgrade-failed-solo-error.js';
import {RelayDestroyFailedSoloError} from './classes/component/relay-destroy-failed-solo-error.js';
import {RelayNotRunningSoloError} from './classes/component/relay-not-running-solo-error.js';
import {RelayNotReadySoloError} from './classes/component/relay-not-ready-solo-error.js';
import {RelayOperatorKeyRetrievalFailedSoloError} from './classes/component/relay-operator-key-retrieval-failed-solo-error.js';
import {MirrorNodeDeployFailedSoloError} from './classes/component/mirror-node-deploy-failed-solo-error.js';
import {MirrorNodeUpgradeFailedSoloError} from './classes/component/mirror-node-upgrade-failed-solo-error.js';
import {MirrorNodeDestroyFailedSoloError} from './classes/component/mirror-node-destroy-failed-solo-error.js';
import {MirrorNodeOperatorKeyRetrievalFailedSoloError} from './classes/component/mirror-node-operator-key-retrieval-failed-solo-error.js';
import {OneShotDeployFailedSoloError} from './classes/component/one-shot-deploy-failed-solo-error.js';
import {OneShotDestroyFailedSoloError} from './classes/component/one-shot-destroy-failed-solo-error.js';
import {OneShotDeploymentInfoRetrievalFailedSoloError} from './classes/component/one-shot-deployment-info-retrieval-failed-solo-error.js';
import {FalconValuesPreparationFailedSoloError} from './classes/component/falcon-values-preparation-failed-solo-error.js';
import {BlockNodeNotInRemoteConfigSoloError} from './classes/system/block-node-not-in-remote-config-solo-error.js';
import {BlockNodeNotReadySoloError} from './classes/system/block-node-not-ready-solo-error.js';
import {BlockNodePodNotFoundSoloError} from './classes/system/block-node-pod-not-found-solo-error.js';
import {ExternalBlockNodeNotInRemoteConfigSoloError} from './classes/system/external-block-node-not-in-remote-config-solo-error.js';
import {ExplorerPodNotFoundSoloError} from './classes/system/explorer-pod-not-found-solo-error.js';
import {ExplorerNotInRemoteConfigSoloError} from './classes/system/explorer-not-in-remote-config-solo-error.js';
import {RelayPodNotFoundSoloError} from './classes/system/relay-pod-not-found-solo-error.js';
import {RelayNotInRemoteConfigSoloError} from './classes/system/relay-not-in-remote-config-solo-error.js';
import {MirrorNodePodsNotFoundSoloError} from './classes/system/mirror-node-pods-not-found-solo-error.js';
import {MirrorIngressControllerPodNotFoundSoloError} from './classes/system/mirror-ingress-controller-pod-not-found-solo-error.js';
import {MirrorNodeNotInRemoteConfigSoloError} from './classes/system/mirror-node-not-in-remote-config-solo-error.js';
import {ClusterNotFoundInRemoteConfigSoloError} from './classes/system/cluster-not-found-in-remote-config-solo-error.js';
import {BlockNodeInvalidComponentIdSoloError} from './classes/validation/block-node-invalid-component-id-solo-error.js';
import {BlockNodeLivenessPortVersionIncompatibleSoloError} from './classes/validation/block-node-liveness-port-version-incompatible-solo-error.js';
import {BlockNodeLocalImageNotFoundSoloError} from './classes/validation/block-node-local-image-not-found-solo-error.js';
import {BlockNodePlatformVersionTooLowSoloError} from './classes/validation/block-node-platform-version-too-low-solo-error.js';
import {ExplorerInvalidComponentIdSoloError} from './classes/validation/explorer-invalid-component-id-solo-error.js';
import {RelayInvalidComponentIdSoloError} from './classes/validation/relay-invalid-component-id-solo-error.js';
import {OneShotCachedDeploymentNotFoundSoloError} from './classes/validation/one-shot-cached-deployment-not-found-solo-error.js';
import {MirrorNodeInvalidComponentIdSoloError} from './classes/validation/mirror-node-invalid-component-id-solo-error.js';

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
    readonly refreshLocalConfigSource: typeof RefreshLocalConfigSourceError;
    readonly remoteMismatch: typeof RemoteConfigsMismatchSoloError;
    readonly writeLocalConfig: typeof WriteLocalConfigFileError;
  } = Object.freeze({
    localNotFound: LocalConfigNotFoundSoloError,
    refreshLocalConfigSource: RefreshLocalConfigSourceError,
    remoteMismatch: RemoteConfigsMismatchSoloError,
    writeLocalConfig: WriteLocalConfigFileError,
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
    readonly nodeTransactionFailed: typeof NodeTransactionFailedSoloError;
    readonly nodeBuildUploadFailed: typeof NodeBuildUploadFailedSoloError;
    readonly nodeBuildCopyFailed: typeof NodeBuildCopyFailedSoloError;
    readonly nodeNotReady: typeof NodeNotReadySoloError;
    readonly nodeJfrExecutionFailed: typeof NodeJfrExecutionFailedSoloError;
    readonly nodeJfrPidNotFound: typeof NodeJfrPidNotFoundSoloError;
    readonly nodeDebugArchiveFailed: typeof NodeDebugArchiveFailedSoloError;
    readonly blockNodeConfigFailed: typeof BlockNodeConfigFailedSoloError;
    readonly blockNodeDeployFailed: typeof BlockNodeDeployFailedSoloError;
    readonly blockNodeDestroyFailed: typeof BlockNodeDestroyFailedSoloError;
    readonly blockNodeUpgradeFailed: typeof BlockNodeUpgradeFailedSoloError;
    readonly blockNodeAddExternalFailed: typeof BlockNodeAddExternalFailedSoloError;
    readonly blockNodeDeleteExternalFailed: typeof BlockNodeDeleteExternalFailedSoloError;
    readonly blockNodeHealthCheckFailed: typeof BlockNodeHealthCheckFailedSoloError;
    readonly chartInstallFailed: typeof ChartInstallFailedSoloError;
    readonly networkDestroyFailed: typeof NetworkDestroyFailedSoloError;
    readonly rapidFireExecutionFailed: typeof RapidFireExecutionSoloError;
    readonly nodeStakeTransactionError: typeof NodeStakeTransactionErrorSoloError;
    readonly nodePrepareUpgradeTransactionError: typeof NodePrepareUpgradeTransactionErrorSoloError;
    readonly nodeFreezeUpgradeTransactionError: typeof NodeFreezeUpgradeTransactionErrorSoloError;
    readonly nodeFreezeTransactionError: typeof NodeFreezeTransactionErrorSoloError;
    readonly nodeUpdateTransactionError: typeof NodeUpdateTransactionErrorSoloError;
    readonly nodeDeleteTransactionError: typeof NodeDeleteTransactionErrorSoloError;
    readonly nodeCreateTransactionError: typeof NodeCreateTransactionErrorSoloError;
    readonly accountBalanceQueryFailed: typeof AccountBalanceQueryFailedSoloError;
    readonly explorerDeployFailed: typeof ExplorerDeployFailedSoloError;
    readonly explorerUpgradeFailed: typeof ExplorerUpgradeFailedSoloError;
    readonly explorerDestroyFailed: typeof ExplorerDestroyFailedSoloError;
    readonly relayDeployFailed: typeof RelayDeployFailedSoloError;
    readonly relayUpgradeFailed: typeof RelayUpgradeFailedSoloError;
    readonly relayDestroyFailed: typeof RelayDestroyFailedSoloError;
    readonly relayNotRunning: typeof RelayNotRunningSoloError;
    readonly relayNotReady: typeof RelayNotReadySoloError;
    readonly relayOperatorKeyRetrievalFailed: typeof RelayOperatorKeyRetrievalFailedSoloError;
    readonly mirrorNodeDeployFailed: typeof MirrorNodeDeployFailedSoloError;
    readonly mirrorNodeUpgradeFailed: typeof MirrorNodeUpgradeFailedSoloError;
    readonly mirrorNodeDestroyFailed: typeof MirrorNodeDestroyFailedSoloError;
    readonly mirrorNodeOperatorKeyRetrievalFailed: typeof MirrorNodeOperatorKeyRetrievalFailedSoloError;
    readonly oneShotDeployFailed: typeof OneShotDeployFailedSoloError;
    readonly oneShotDestroyFailed: typeof OneShotDestroyFailedSoloError;
    readonly oneShotDeploymentInfoRetrievalFailed: typeof OneShotDeploymentInfoRetrievalFailedSoloError;
    readonly falconValuesPreparationFailed: typeof FalconValuesPreparationFailedSoloError;
  } = Object.freeze({
    nodeTransactionFailed: NodeTransactionFailedSoloError,
    nodeBuildUploadFailed: NodeBuildUploadFailedSoloError,
    nodeBuildCopyFailed: NodeBuildCopyFailedSoloError,
    nodeNotReady: NodeNotReadySoloError,
    nodeJfrExecutionFailed: NodeJfrExecutionFailedSoloError,
    nodeJfrPidNotFound: NodeJfrPidNotFoundSoloError,
    nodeDebugArchiveFailed: NodeDebugArchiveFailedSoloError,
    blockNodeConfigFailed: BlockNodeConfigFailedSoloError,
    blockNodeDeployFailed: BlockNodeDeployFailedSoloError,
    blockNodeDestroyFailed: BlockNodeDestroyFailedSoloError,
    blockNodeUpgradeFailed: BlockNodeUpgradeFailedSoloError,
    blockNodeAddExternalFailed: BlockNodeAddExternalFailedSoloError,
    blockNodeDeleteExternalFailed: BlockNodeDeleteExternalFailedSoloError,
    blockNodeHealthCheckFailed: BlockNodeHealthCheckFailedSoloError,
    chartInstallFailed: ChartInstallFailedSoloError,
    networkDestroyFailed: NetworkDestroyFailedSoloError,
    rapidFireExecutionFailed: RapidFireExecutionSoloError,
    nodeStakeTransactionError: NodeStakeTransactionErrorSoloError,
    nodePrepareUpgradeTransactionError: NodePrepareUpgradeTransactionErrorSoloError,
    nodeFreezeUpgradeTransactionError: NodeFreezeUpgradeTransactionErrorSoloError,
    nodeFreezeTransactionError: NodeFreezeTransactionErrorSoloError,
    nodeUpdateTransactionError: NodeUpdateTransactionErrorSoloError,
    nodeDeleteTransactionError: NodeDeleteTransactionErrorSoloError,
    nodeCreateTransactionError: NodeCreateTransactionErrorSoloError,
    accountBalanceQueryFailed: AccountBalanceQueryFailedSoloError,
    explorerDeployFailed: ExplorerDeployFailedSoloError,
    explorerUpgradeFailed: ExplorerUpgradeFailedSoloError,
    explorerDestroyFailed: ExplorerDestroyFailedSoloError,
    relayDeployFailed: RelayDeployFailedSoloError,
    relayUpgradeFailed: RelayUpgradeFailedSoloError,
    relayDestroyFailed: RelayDestroyFailedSoloError,
    relayNotRunning: RelayNotRunningSoloError,
    relayNotReady: RelayNotReadySoloError,
    relayOperatorKeyRetrievalFailed: RelayOperatorKeyRetrievalFailedSoloError,
    mirrorNodeDeployFailed: MirrorNodeDeployFailedSoloError,
    mirrorNodeUpgradeFailed: MirrorNodeUpgradeFailedSoloError,
    mirrorNodeDestroyFailed: MirrorNodeDestroyFailedSoloError,
    mirrorNodeOperatorKeyRetrievalFailed: MirrorNodeOperatorKeyRetrievalFailedSoloError,
    oneShotDeployFailed: OneShotDeployFailedSoloError,
    oneShotDestroyFailed: OneShotDestroyFailedSoloError,
    oneShotDeploymentInfoRetrievalFailed: OneShotDeploymentInfoRetrievalFailedSoloError,
    falconValuesPreparationFailed: FalconValuesPreparationFailedSoloError,
  });

  // 4xxx — Validation: User input, flags, IDs, formatting
  public static readonly validation: {
    readonly blockNodeLocalImageNotFound: typeof BlockNodeLocalImageNotFoundSoloError;
    readonly blockNodeInvalidComponentId: typeof BlockNodeInvalidComponentIdSoloError;
    readonly blockNodePlatformVersionTooLow: typeof BlockNodePlatformVersionTooLowSoloError;
    readonly blockNodeLivenessPortVersionIncompatible: typeof BlockNodeLivenessPortVersionIncompatibleSoloError;
    readonly consensusNodeCountRequired: typeof ConsensusNodeCountRequiredError;
    readonly illegalArgument: typeof IllegalArgumentError;
    readonly invalidOutputFormat: typeof InvalidOutputFormatError;
    readonly invalidPortNumber: typeof InvalidPortNumberError;
    readonly missingArgument: typeof MissingArgumentError;
    readonly localBuildPathNotFound: typeof LocalBuildPathNotFoundSoloError;
    readonly localBuildMissingSubdirectories: typeof LocalBuildMissingSubdirectoriesSoloError;
    readonly localBuildNoJarFiles: typeof LocalBuildNoJarFilesSoloError;
    readonly nodeJarFilesNotInContainer: typeof NodeJarFilesNotInContainerSoloError;
    readonly grpcEndpointsRequired: typeof GrpcEndpointsRequiredSoloError;
    readonly outputDirectoryNotSpecified: typeof OutputDirectoryNotSpecifiedSoloError;
    readonly inputDirectoryNotSpecified: typeof InputDirectoryNotSpecifiedSoloError;
    readonly wrapsKeyPathNotFound: typeof WrapsKeyPathNotFoundSoloError;
    readonly configFileNotFound: typeof ConfigFileNotFoundSoloError;
    readonly nodeVersionMismatch: typeof NodeVersionMismatchSoloError;
    readonly upgradeVersionNotFound: typeof UpgradeVersionNotFoundSoloError;
    readonly pvcFlagNotEnabled: typeof PvcFlagNotEnabledSoloError;
    readonly nonInteractivePrompt: typeof NonInteractivePromptSoloError;
    readonly realmShardVersionConstraint: typeof RealmShardVersionConstraintSoloError;
    readonly wrapsVersionConstraint: typeof WrapsVersionConstraintSoloError;
    readonly stateFilePathNotFound: typeof StateFilePathNotFoundSoloError;
    readonly stateFileNotFound: typeof StateFileNotFoundSoloError;
    readonly invalidStateFileFormat: typeof InvalidStateFileFormatSoloError;
    readonly invalidStateZipFileName: typeof InvalidStateZipFileNameSoloError;
    readonly explorerInvalidComponentId: typeof ExplorerInvalidComponentIdSoloError;
    readonly relayInvalidComponentId: typeof RelayInvalidComponentIdSoloError;
    readonly mirrorNodeInvalidComponentId: typeof MirrorNodeInvalidComponentIdSoloError;
    readonly oneShotCachedDeploymentNotFound: typeof OneShotCachedDeploymentNotFoundSoloError;
  } = Object.freeze({
    blockNodeLocalImageNotFound: BlockNodeLocalImageNotFoundSoloError,
    blockNodeInvalidComponentId: BlockNodeInvalidComponentIdSoloError,
    blockNodePlatformVersionTooLow: BlockNodePlatformVersionTooLowSoloError,
    blockNodeLivenessPortVersionIncompatible: BlockNodeLivenessPortVersionIncompatibleSoloError,
    consensusNodeCountRequired: ConsensusNodeCountRequiredError,
    illegalArgument: IllegalArgumentError,
    invalidOutputFormat: InvalidOutputFormatError,
    invalidPortNumber: InvalidPortNumberError,
    missingArgument: MissingArgumentError,
    localBuildPathNotFound: LocalBuildPathNotFoundSoloError,
    localBuildMissingSubdirectories: LocalBuildMissingSubdirectoriesSoloError,
    localBuildNoJarFiles: LocalBuildNoJarFilesSoloError,
    nodeJarFilesNotInContainer: NodeJarFilesNotInContainerSoloError,
    grpcEndpointsRequired: GrpcEndpointsRequiredSoloError,
    outputDirectoryNotSpecified: OutputDirectoryNotSpecifiedSoloError,
    inputDirectoryNotSpecified: InputDirectoryNotSpecifiedSoloError,
    wrapsKeyPathNotFound: WrapsKeyPathNotFoundSoloError,
    configFileNotFound: ConfigFileNotFoundSoloError,
    nodeVersionMismatch: NodeVersionMismatchSoloError,
    upgradeVersionNotFound: UpgradeVersionNotFoundSoloError,
    pvcFlagNotEnabled: PvcFlagNotEnabledSoloError,
    nonInteractivePrompt: NonInteractivePromptSoloError,
    realmShardVersionConstraint: RealmShardVersionConstraintSoloError,
    wrapsVersionConstraint: WrapsVersionConstraintSoloError,
    stateFilePathNotFound: StateFilePathNotFoundSoloError,
    stateFileNotFound: StateFileNotFoundSoloError,
    invalidStateFileFormat: InvalidStateFileFormatSoloError,
    invalidStateZipFileName: InvalidStateZipFileNameSoloError,
    explorerInvalidComponentId: ExplorerInvalidComponentIdSoloError,
    relayInvalidComponentId: RelayInvalidComponentIdSoloError,
    mirrorNodeInvalidComponentId: MirrorNodeInvalidComponentIdSoloError,
    oneShotCachedDeploymentNotFound: OneShotCachedDeploymentNotFoundSoloError,
  });

  // 5xxx — System / Environment: kubectl, DNS, permissions, timeouts
  public static readonly system: {
    readonly blockNodePodNotFound: typeof BlockNodePodNotFoundSoloError;
    readonly blockNodeNotReady: typeof BlockNodeNotReadySoloError;
    readonly blockNodeNotInRemoteConfig: typeof BlockNodeNotInRemoteConfigSoloError;
    readonly externalBlockNodeNotInRemoteConfig: typeof ExternalBlockNodeNotInRemoteConfigSoloError;
    readonly clusterConnectionFailed: typeof ClusterConnectionFailedError;
    readonly githubApiHttpResponseError: typeof GitHubApiHttpResponseError;
    readonly githubApiRequestFailed: typeof GitHubApiRequestFailedError;
    readonly githubApiResponseMissingTagName: typeof GitHubApiResponseMissingTagNameError;
    readonly githubApiResponseParseFailed: typeof GitHubApiResponseParseFailedError;
    readonly portForwardRefreshFailed: typeof PortForwardRefreshFailedError;
    readonly portForwardStatusFailed: typeof PortForwardStatusFailedError;
    readonly resourceNotFound: typeof ResourceNotFoundError;
    readonly namespaceNotFound: typeof NamespaceNotFoundSoloError;
    readonly podNotFound: typeof PodNotFoundSoloError;
    readonly haproxyPodsNotFound: typeof HaproxyPodsNotFoundSoloError;
    readonly loadBalancerNotFound: typeof LoadBalancerNotFoundSoloError;
    readonly kubeContextNotFound: typeof KubeContextNotFoundSoloError;
    readonly consensusNodeNotInConfig: typeof ConsensusNodeNotInConfigSoloError;
    readonly k8sSecretCreateFailed: typeof K8sSecretCreateFailedSoloError;
    readonly statesDirectoryNotFound: typeof StatesDirectoryNotFoundSoloError;
    readonly portForwardMissing: typeof PortForwardMissingSoloError;
    readonly noPvcFound: typeof NoPvcFoundSoloError;
    readonly clusterReferenceUndetermined: typeof ClusterReferenceUndeterminedSoloError;
    readonly upgradeVersionFetchFailed: typeof UpgradeVersionFetchFailedSoloError;
    readonly multipleDeploymentsFound: typeof MultipleDeploymentsFoundSoloError;
    readonly grpcProxyEndpointFailed: typeof GrpcProxyEndpointFailedSoloError;
    readonly explorerPodNotFound: typeof ExplorerPodNotFoundSoloError;
    readonly explorerNotInRemoteConfig: typeof ExplorerNotInRemoteConfigSoloError;
    readonly relayPodNotFound: typeof RelayPodNotFoundSoloError;
    readonly relayNotInRemoteConfig: typeof RelayNotInRemoteConfigSoloError;
    readonly mirrorNodePodsNotFound: typeof MirrorNodePodsNotFoundSoloError;
    readonly mirrorIngressControllerPodNotFound: typeof MirrorIngressControllerPodNotFoundSoloError;
    readonly mirrorNodeNotInRemoteConfig: typeof MirrorNodeNotInRemoteConfigSoloError;
    readonly clusterNotFoundInRemoteConfig: typeof ClusterNotFoundInRemoteConfigSoloError;
  } = Object.freeze({
    blockNodePodNotFound: BlockNodePodNotFoundSoloError,
    blockNodeNotReady: BlockNodeNotReadySoloError,
    blockNodeNotInRemoteConfig: BlockNodeNotInRemoteConfigSoloError,
    externalBlockNodeNotInRemoteConfig: ExternalBlockNodeNotInRemoteConfigSoloError,
    clusterConnectionFailed: ClusterConnectionFailedError,
    githubApiHttpResponseError: GitHubApiHttpResponseError,
    githubApiRequestFailed: GitHubApiRequestFailedError,
    githubApiResponseMissingTagName: GitHubApiResponseMissingTagNameError,
    githubApiResponseParseFailed: GitHubApiResponseParseFailedError,
    portForwardRefreshFailed: PortForwardRefreshFailedError,
    portForwardStatusFailed: PortForwardStatusFailedError,
    resourceNotFound: ResourceNotFoundError,
    namespaceNotFound: NamespaceNotFoundSoloError,
    podNotFound: PodNotFoundSoloError,
    haproxyPodsNotFound: HaproxyPodsNotFoundSoloError,
    loadBalancerNotFound: LoadBalancerNotFoundSoloError,
    kubeContextNotFound: KubeContextNotFoundSoloError,
    consensusNodeNotInConfig: ConsensusNodeNotInConfigSoloError,
    k8sSecretCreateFailed: K8sSecretCreateFailedSoloError,
    statesDirectoryNotFound: StatesDirectoryNotFoundSoloError,
    portForwardMissing: PortForwardMissingSoloError,
    noPvcFound: NoPvcFoundSoloError,
    clusterReferenceUndetermined: ClusterReferenceUndeterminedSoloError,
    upgradeVersionFetchFailed: UpgradeVersionFetchFailedSoloError,
    multipleDeploymentsFound: MultipleDeploymentsFoundSoloError,
    grpcProxyEndpointFailed: GrpcProxyEndpointFailedSoloError,
    explorerPodNotFound: ExplorerPodNotFoundSoloError,
    explorerNotInRemoteConfig: ExplorerNotInRemoteConfigSoloError,
    relayPodNotFound: RelayPodNotFoundSoloError,
    relayNotInRemoteConfig: RelayNotInRemoteConfigSoloError,
    mirrorNodePodsNotFound: MirrorNodePodsNotFoundSoloError,
    mirrorIngressControllerPodNotFound: MirrorIngressControllerPodNotFoundSoloError,
    mirrorNodeNotInRemoteConfig: MirrorNodeNotInRemoteConfigSoloError,
    clusterNotFoundInRemoteConfig: ClusterNotFoundInRemoteConfigSoloError,
  });

  // 9xxx — Internal: Unexpected bugs, unimplemented paths
  public static readonly internal: {
    readonly unsupportedOperation: typeof UnsupportedOperationError;
    readonly readRemoteConfigBeforeLoad: typeof ReadRemoteConfigBeforeLoadError;
    readonly writeRemoteConfigBeforeLoad: typeof WriteRemoteConfigBeforeLoadError;
    readonly dataValidation: typeof DataValidationError;
  } = Object.freeze({
    unsupportedOperation: UnsupportedOperationError,
    readRemoteConfigBeforeLoad: ReadRemoteConfigBeforeLoadError,
    writeRemoteConfigBeforeLoad: WriteRemoteConfigBeforeLoadError,
    dataValidation: DataValidationError,
  });
}
