// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class PodTerminationTimeoutSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(namespace: string, labels: string[]) {
    super({
      message: `Timed out waiting for pods to terminate in namespace ${namespace} for labels [${labels.join(', ')}]`,
      code: ErrorCodeRegistry.POD_TERMINATION_TIMEOUT,
      troubleshootingSteps:
        `List pods still present: kubectl get pods -n ${namespace} -l ${labels.join(',')}\n` +
        `Describe stuck pods for termination events: kubectl describe pod -n ${namespace} -l ${labels.join(',')}\n` +
        `Check for finalizers blocking deletion: kubectl get pod -n ${namespace} -l ${labels.join(',')} -o jsonpath='{.items[*].metadata.finalizers}'\n` +
        `Force-delete stuck pods if safe: kubectl delete pod -n ${namespace} -l ${labels.join(',')} --force --grace-period=0\n` +
        'Check solo logs for context: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
