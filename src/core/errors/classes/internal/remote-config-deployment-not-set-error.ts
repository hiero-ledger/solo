// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
