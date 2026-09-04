// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the backup input directory contains no per-cluster directories; the message names the
 * directory. A valid backup groups data under cluster directories, so this means none were found — the
 * directory is not a valid backup or is empty.
 */
export class BackupNoClusterDirectoriesSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(inputDirectory: string) {
    super({
      message: `No cluster directories found in: ${inputDirectory}`,
      code: ErrorCodeRegistry.BACKUP_NO_CLUSTER_DIRS,
      troubleshootingSteps:
        `Verify the input directory contains cluster subdirectories: ${inputDirectory}\n` +
        'Ensure you are pointing to the correct backup directory\n' +
        'Re-export the backup: solo config ops backup',
    });
  }
}
