// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a backup input directory does not contain the expected `solo-remote-config.yaml`; the message
 * names the path and the expected `<input-dir>/<cluster-ref>/configmaps/solo-remote-config.yaml` structure.
 * solo validates the backup layout before restoring, so this means the directory is not a valid backup or
 * the wrong path was given.
 */
export class BackupClusterValidationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(configPath: string) {
    super({
      message: `solo-remote-config.yaml not found at: ${configPath}. Expected structure: <input-dir>/<cluster-ref>/configmaps/solo-remote-config.yaml`,
      code: ErrorCodeRegistry.BACKUP_CLUSTER_VALIDATION_FAILED,
      troubleshootingSteps:
        'Verify the backup archive was exported with compatible Solo and cluster versions\n' +
        'Check cluster references: solo cluster-ref config list\n' +
        'Re-export the backup from the original cluster: solo config ops backup',
    });
  }
}
