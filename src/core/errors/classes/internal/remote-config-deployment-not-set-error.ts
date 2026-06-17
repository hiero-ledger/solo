// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown while loading the remote configuration when the selected deployment is
 * not present in the local configuration; the message names the deployment that was expected.
 * solo uses the deployment entry in local config to locate the namespace and clusters whose
 * remote config it should read, so this fires when that entry is missing at a point where it
 * should already have been established. It reflects a broken internal precondition (a missing
 * or out-of-order setup step) rather than direct user input.
 */
export class RemoteConfigDeploymentNotSetError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(deploymentName: string) {
    super({
      message: `Selected deployment '${deploymentName}' is not set in local configuration`,
      code: ErrorCodeRegistry.REMOTE_CONFIG_DEPLOYMENT_NOT_SET,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
