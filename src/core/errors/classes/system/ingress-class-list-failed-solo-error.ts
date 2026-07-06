// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot list Kubernetes IngressClasses; the underlying failure is wrapped in `cause`.
 * solo reads IngressClasses to configure ingress for components, so this means the lookup failed — for
 * example the cluster API was unreachable or the current user lacks permission.
 */
export class IngressClassListFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to list Kubernetes IngressClasses: ${cause.message}`,
        code: ErrorCodeRegistry.INGRESS_CLASS_LIST_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify Kubernetes connectivity: kubectl cluster-info\n' +
          'List IngressClasses manually: kubectl get ingressclass\n' +
          'Ensure the Kubernetes API server supports IngressClass resources (requires v1.18+)',
      },
      cause,
    );
  }
}
