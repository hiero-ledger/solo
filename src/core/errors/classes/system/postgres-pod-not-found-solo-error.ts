// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot find the Postgres pod; the message names the namespace. solo locates the mirror
 * node Postgres pod to operate on the database, so this is raised when no matching pod exists in the
 * namespace — for example the database failed to start or was not deployed.
 */
export class PostgresPodNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(namespace: string) {
    super({
      message: `Postgres pod not found in namespace '${namespace}'`,
      code: ErrorCodeRegistry.POSTGRES_POD_NOT_FOUND,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        `Verify Postgres pods are running: kubectl get pods -n ${namespace} -l app.kubernetes.io/name=postgresql\n` +
        `Inspect Postgres deployment: kubectl describe deployment -n ${namespace}\n` +
        'Re-deploy the mirror node to recreate Postgres: solo mirror node add',
    });
  }
}
