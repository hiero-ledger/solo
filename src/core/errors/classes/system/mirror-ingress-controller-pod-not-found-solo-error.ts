// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class MirrorIngressControllerPodNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'No mirror ingress controller pod found',
      code: ErrorCodeRegistry.MIRROR_INGRESS_CONTROLLER_POD_NOT_FOUND,
      troubleshootingSteps:
        'Check ingress controller pod status: kubectl get pods -A | grep ingress\n' +
        'Describe pods to check for crashes or evictions: kubectl describe pods -A -l app.kubernetes.io/name=haproxy-ingress\n' +
        'Check recent namespace events: kubectl get events -n <namespace> --sort-by=.lastTimestamp',
    });
  }
}
