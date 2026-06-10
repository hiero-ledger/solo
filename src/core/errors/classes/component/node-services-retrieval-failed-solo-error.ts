// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeServicesRetrievalFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to retrieve node services: ${cause.message}`,
        code: ErrorCodeRegistry.NODE_SERVICES_RETRIEVAL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'List Kubernetes services in the namespace: kubectl get svc -n <namespace>\n' +
          'Verify consensus nodes are deployed: kubectl get pods -n <namespace>',
      },
      cause,
    );
  }
}
