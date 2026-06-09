// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
