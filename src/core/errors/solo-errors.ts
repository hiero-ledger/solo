// SPDX-License-Identifier: Apache-2.0

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
import {CreateDeploymentSoloError} from './classes/create-deployment-solo-error.js';
import {DeploymentAlreadyExistsSoloError} from './classes/deployment-already-exists-solo-error.js';
import {LocalConfigNotFoundSoloError} from './classes/local-config-not-found-solo-error.js';
import {RemoteConfigsMismatchSoloError} from './classes/remote-configs-mismatch-solo-error.js';
import {BlockNodeConfigFailedSoloError} from './classes/component/block-node-config-failed-solo-error.js';
import {ChartInstallFailedSoloError} from './classes/component/chart-install-failed-solo-error.js';
import {NetworkDestroyFailedSoloError} from './classes/component/network-destroy-failed-solo-error.js';
import {NodeBuildCopyFailedSoloError} from './classes/component/node-build-copy-failed-solo-error.js';
import {NodeBuildUploadFailedSoloError} from './classes/component/node-build-upload-failed-solo-error.js';
import {NodeDebugArchiveFailedSoloError} from './classes/component/node-debug-archive-failed-solo-error.js';
import {NodeJfrExecutionFailedSoloError} from './classes/component/node-jfr-execution-failed-solo-error.js';
import {NodeJfrPidNotFoundSoloError} from './classes/component/node-jfr-pid-not-found-solo-error.js';
import {NodeNotReadySoloError} from './classes/component/node-not-ready-solo-error.js';
import {NodeTransactionErrorSoloError} from './classes/component/node-transaction-error-solo-error.js';
import {NodeTransactionFailedSoloError} from './classes/component/node-transaction-failed-solo-error.js';
import {ConfigFileNotFoundSoloError} from './classes/validation/config-file-not-found-solo-error.js';
import {GrpcEndpointsRequiredSoloError} from './classes/validation/grpc-endpoints-required-solo-error.js';
import {InputDirectoryNotSpecifiedSoloError} from './classes/validation/input-directory-not-specified-solo-error.js';
import {LocalBuildMissingSubdirsSoloError} from './classes/validation/local-build-missing-subdirs-solo-error.js';
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
import {DeploymentNotFoundSoloError} from './classes/system/deployment-not-found-solo-error.js';
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
    readonly createFailed: typeof CreateDeploymentSoloError;
  } = Object.freeze({
    alreadyExists: DeploymentAlreadyExistsSoloError,
    createFailed: CreateDeploymentSoloError,
  });

  // 3xxx — Component: Relay, Mirror Node, Explorer, CN runtime
  public static readonly component: {
    readonly nodeTransactionFailed: typeof NodeTransactionFailedSoloError;
    readonly nodeTransactionError: typeof NodeTransactionErrorSoloError;
    readonly nodeBuildUploadFailed: typeof NodeBuildUploadFailedSoloError;
    readonly nodeBuildCopyFailed: typeof NodeBuildCopyFailedSoloError;
    readonly nodeNotReady: typeof NodeNotReadySoloError;
    readonly nodeJfrExecutionFailed: typeof NodeJfrExecutionFailedSoloError;
    readonly nodeJfrPidNotFound: typeof NodeJfrPidNotFoundSoloError;
    readonly nodeDebugArchiveFailed: typeof NodeDebugArchiveFailedSoloError;
    readonly blockNodeConfigFailed: typeof BlockNodeConfigFailedSoloError;
    readonly chartInstallFailed: typeof ChartInstallFailedSoloError;
    readonly networkDestroyFailed: typeof NetworkDestroyFailedSoloError;
  } = Object.freeze({
    nodeTransactionFailed: NodeTransactionFailedSoloError,
    nodeTransactionError: NodeTransactionErrorSoloError,
    nodeBuildUploadFailed: NodeBuildUploadFailedSoloError,
    nodeBuildCopyFailed: NodeBuildCopyFailedSoloError,
    nodeNotReady: NodeNotReadySoloError,
    nodeJfrExecutionFailed: NodeJfrExecutionFailedSoloError,
    nodeJfrPidNotFound: NodeJfrPidNotFoundSoloError,
    nodeDebugArchiveFailed: NodeDebugArchiveFailedSoloError,
    blockNodeConfigFailed: BlockNodeConfigFailedSoloError,
    chartInstallFailed: ChartInstallFailedSoloError,
    networkDestroyFailed: NetworkDestroyFailedSoloError,
  });

  // 4xxx — Validation: User input, flags, IDs, formatting
  public static readonly validation: {
    readonly consensusNodeCountRequired: typeof ConsensusNodeCountRequiredError;
    readonly dataValidation: typeof DataValidationError;
    readonly illegalArgument: typeof IllegalArgumentError;
    readonly invalidOutputFormat: typeof InvalidOutputFormatError;
    readonly invalidPortNumber: typeof InvalidPortNumberError;
    readonly missingArgument: typeof MissingArgumentError;
    readonly localBuildPathNotFound: typeof LocalBuildPathNotFoundSoloError;
    readonly localBuildMissingSubdirs: typeof LocalBuildMissingSubdirsSoloError;
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
  } = Object.freeze({
    consensusNodeCountRequired: ConsensusNodeCountRequiredError,
    dataValidation: DataValidationError,
    illegalArgument: IllegalArgumentError,
    invalidOutputFormat: InvalidOutputFormatError,
    invalidPortNumber: InvalidPortNumberError,
    missingArgument: MissingArgumentError,
    localBuildPathNotFound: LocalBuildPathNotFoundSoloError,
    localBuildMissingSubdirs: LocalBuildMissingSubdirsSoloError,
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
  });

  // 5xxx — System / Environment: kubectl, DNS, permissions, timeouts
  public static readonly system: {
    readonly clusterConnectionFailed: typeof ClusterConnectionFailedError;
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
    readonly deploymentNotFound: typeof DeploymentNotFoundSoloError;
    readonly multipleDeploymentsFound: typeof MultipleDeploymentsFoundSoloError;
    readonly grpcProxyEndpointFailed: typeof GrpcProxyEndpointFailedSoloError;
  } = Object.freeze({
    clusterConnectionFailed: ClusterConnectionFailedError,
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
    deploymentNotFound: DeploymentNotFoundSoloError,
    multipleDeploymentsFound: MultipleDeploymentsFoundSoloError,
    grpcProxyEndpointFailed: GrpcProxyEndpointFailedSoloError,
  });

  // 9xxx — Internal: Unexpected bugs, unimplemented paths
  public static readonly internal: {
    readonly unsupportedOperation: typeof UnsupportedOperationError;
  } = Object.freeze({
    unsupportedOperation: UnsupportedOperationError,
  });
}
