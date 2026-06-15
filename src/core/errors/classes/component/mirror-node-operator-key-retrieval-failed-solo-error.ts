// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot retrieve the operator key the mirror node needs; the underlying failure is
 * wrapped in `cause`. solo reads the operator account key (for example from a secret) so the mirror node
 * can perform its operations, so this means that retrieval failed. It is retryable, since a transient
 * cluster or lookup problem often clears on a later attempt.
 */
export class MirrorNodeOperatorKeyRetrievalFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error getting mirror node operator key: ${cause.message}`,
        code: ErrorCodeRegistry.MIRROR_NODE_OPERATOR_KEY_RETRIEVAL_FAILED,
        troubleshootingSteps:
          'Verify K8s API connectivity: kubectl get pods -n <namespace>\n' +
          'If an operator key secret exists, verify it has a privateKey field: kubectl get secret -n <namespace> -o yaml | grep privateKey\n' +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
