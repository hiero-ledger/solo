// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a command needs at least one deployment to act on but the local
 * configuration contains none. solo stores every deployment in local config and several
 * commands assume one already exists, so this is raised when that list is empty — typically
 * because no deployment has been created yet, or because they were all deleted (or the active
 * `SOLO_HOME`/local config does not contain any). Create a deployment before running the
 * command.
 */
export class NoDeploymentsFoundError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'No deployments found in local config',
      code: ErrorCodeRegistry.NO_DEPLOYMENTS_FOUND,
      troubleshootingSteps: 'Create a deployment: solo deployment config create',
    });
  }
}
