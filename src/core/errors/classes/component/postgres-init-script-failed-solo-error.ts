// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class PostgresInitScriptFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(attempt: number, cause: Error) {
    super(
      {
        message: `Failed to run Mirror Node Postgres initialization script after ${attempt} attempts: ${cause}`,
        code: ErrorCodeRegistry.POSTGRES_INIT_SCRIPT_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect Postgres pod logs: kubectl logs <postgres-pod> -n <namespace>\n' +
          'Check Postgres pod status: kubectl describe pod <postgres-pod> -n <namespace>\n' +
          'Re-deploy the mirror node: solo mirror node add',
      },
      cause,
    );
  }
}
