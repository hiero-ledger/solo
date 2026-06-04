// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class RelayPodNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'No relay pod found',
      code: ErrorCodeRegistry.RELAY_POD_NOT_FOUND,
      troubleshootingSteps:
        'Check pod status: kubectl get pods -A | grep relay\n' +
        'Describe pods to check for crashes or evictions: kubectl describe pods -A -l app.kubernetes.io/instance=relay-<index>\n' +
        'Check recent namespace events: kubectl get events -n <namespace> --sort-by=.lastTimestamp',
    });
  }
}
