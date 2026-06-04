// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class RelayOperatorKeyRetrievalFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error getting relay operator key: ${cause.message}`,
        code: ErrorCodeRegistry.RELAY_OPERATOR_KEY_RETRIEVAL_FAILED,
        troubleshootingSteps:
          'Verify K8s API connectivity: kubectl get pods -n <namespace>\n' +
          'If an operator key secret exists, verify it has a privateKey field: kubectl get secret -n <namespace> -o yaml | grep privateKey\n' +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
