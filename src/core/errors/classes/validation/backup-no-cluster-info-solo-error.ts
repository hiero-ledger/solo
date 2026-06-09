// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BackupNoClusterInfoSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'No cluster information found in the backup configuration file',
      code: ErrorCodeRegistry.BACKUP_NO_CLUSTER_INFO,
      troubleshootingSteps:
        'Verify the backup configuration file contains cluster information\n' +
        'Ensure the backup was exported with a compatible Solo version\n' +
        'Re-export the backup: solo config ops backup',
    });
  }
}
