// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the mirror node Postgres initialization script fails to run; the message includes the number
 * of attempts made and wraps the underlying failure. solo runs this script to initialize the mirror node
 * database, so this means execution did not succeed across the attempts tried — for example the database
 * was not ready or the script returned an error. It is retryable, since a database that is still starting
 * often accepts the script on a later attempt.
 */
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
