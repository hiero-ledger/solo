// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot copy the mirror node Postgres initialization script into its container; the
 * message names the namespace and wraps the underlying failure in `cause`. solo copies this script into the
 * database container before running it, so this means the copy failed — for example the target container or
 * pod was not reachable, or the destination was not writable.
 */
export class PostgresInitScriptCopyFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(namespace: string, cause: Error) {
    super(
      {
        message: `Failed to copy Mirror Node Postgres initialization script to container in namespace ${namespace}: ${cause.message}`,
        code: ErrorCodeRegistry.POSTGRES_INIT_SCRIPT_COPY_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Verify the Postgres pod is running: kubectl get pods -n ${namespace} -l app.kubernetes.io/name=postgresql\n` +
          `Inspect Postgres pod logs: kubectl logs <postgres-pod> -n ${namespace}\n` +
          'Re-deploy the mirror node: solo mirror node add',
      },
      cause,
    );
  }
}
