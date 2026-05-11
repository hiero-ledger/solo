// SPDX-License-Identifier: Apache-2.0

import {CreateDeploymentSoloError} from './classes/create-deployment-solo-error.js';
import {DeploymentAlreadyExistsSoloError} from './classes/deployment-already-exists-solo-error.js';
import {LocalConfigNotFoundSoloError} from './classes/local-config-not-found-solo-error.js';
import {RemoteConfigsMismatchSoloError} from './classes/remote-configs-mismatch-solo-error.js';

/**
 * Registry of typed Solo error constructors, grouped by error code category.
 *
 * To add a new error type:
 * 1. Create `src/core/errors/classes/<kebab-name>.ts` — a class extending SoloError,
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
    readonly createFailed: typeof CreateDeploymentSoloError;
  } = Object.freeze({
    alreadyExists: DeploymentAlreadyExistsSoloError,
    createFailed: CreateDeploymentSoloError,
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
