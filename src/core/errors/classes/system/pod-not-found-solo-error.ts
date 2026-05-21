// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class PodNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(nodeAlias: string, cause?: Error) {
    super(
      {
        message: `No pod found for nodeAlias: ${nodeAlias}`,
        code: ErrorCodeRegistry.POD_NOT_FOUND,
        troubleshootingSteps:
          'Check pod status: kubectl get pods -n <namespace> -l solo.hedera.com/node-name=<nodeAlias>\n' +
          'Describe the pod for events: kubectl describe pod -n <namespace> -l solo.hedera.com/node-name=<nodeAlias>\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
