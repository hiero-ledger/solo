// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown during `solo config ops restore-config` when a particular resource cannot
 * be imported from a backup; the message names the `resourceType` and wraps the underlying
 * failure in `cause`. Restore reads each resource from the backup archive and applies it to the
 * cluster, so this is raised when reading the archive entry or applying it fails — for example
 * the backup archive is incomplete or corrupt, the resource is invalid, or the Kubernetes API
 * is unreachable or rejected it.
 */
export class BackupImportFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(resourceType: string, cause: Error) {
    super(
      {
        message: `Failed to import ${resourceType}: ${cause.message}`,
        code: ErrorCodeRegistry.BACKUP_IMPORT_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify Kubernetes connectivity: kubectl get pods -A\n' +
          'Verify the backup archive is complete and valid\n' +
          'Run restore: solo config ops restore-config',
      },
      cause,
    );
  }
}
