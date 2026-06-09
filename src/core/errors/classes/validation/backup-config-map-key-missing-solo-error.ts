// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BackupConfigMapKeyMissingSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(key: string) {
    super({
      message: `Backup ConfigMap does not contain the required key '${key}'`,
      code: ErrorCodeRegistry.BACKUP_CONFIG_MAP_KEY_MISSING,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify the Kubernetes ConfigMap contains the expected data\n' +
        'Re-export the backup to regenerate the ConfigMap: solo config ops backup',
    });
  }
}
