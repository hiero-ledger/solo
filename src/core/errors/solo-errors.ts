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
  public static readonly component: Record<string, never> = Object.freeze({});

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
