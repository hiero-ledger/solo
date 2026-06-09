// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BackupExportFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(resourceType: string, cause: Error) {
    super(
      {
        message: `Failed to export ${resourceType}: ${cause.message}`,
        code: ErrorCodeRegistry.BACKUP_EXPORT_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify Kubernetes connectivity: kubectl get pods -A\n' +
          'Check that the deployment exists: solo deployment config list\n' +
          'Run backup again: solo config ops backup',
      },
      cause,
    );
  }
}
