// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo config ops restore-clusters` cannot recreate the clusters
 * captured in a backup; the underlying failure is wrapped in `cause`. This step reads the backup
 * archive and rebuilds the cluster(s) it describes (for example recreating a Kind cluster)
 * before the rest of a restore can proceed, so the error means that rebuild failed. Common roots
 * are an invalid or incomplete backup archive, an incorrect input directory, or Docker/Kind not
 * being available to create the clusters.
 */
export class BackupRestoreClustersFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Restoring clusters from backup failed: ${cause.message}`,
        code: ErrorCodeRegistry.BACKUP_RESTORE_CLUSTERS_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the backup archive is valid and the input directory is correct\n' +
          'Check Docker or Kind cluster availability: kind get clusters\n' +
          'Run cluster restore: solo config ops restore-clusters',
      },
      cause,
    );
  }
}
