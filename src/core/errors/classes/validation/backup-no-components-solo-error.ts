// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the deployment state to restore contains no components. solo restores components recorded in
 * the backup, so this means none were found to restore — for example an empty or incomplete backup.
 */
export class BackupNoComponentsSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'No components found in the deployment state to restore',
      code: ErrorCodeRegistry.BACKUP_NO_COMPONENTS,
      troubleshootingSteps:
        'Verify the backup archive contains component state information\n' +
        'Ensure the backup was exported from a deployment with active components\n' +
        'Re-export the backup: solo config ops backup',
    });
  }
}
