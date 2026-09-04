// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot find any HAProxy pods. solo relies on HAProxy pods to route traffic to consensus
 * nodes, so this is raised when none are present in the namespace. It is retryable because the pods may
 * still be scheduling; if it persists, HAProxy failed to start or was not deployed.
 */
export class HaproxyPodsNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'No HAProxy pods found',
      code: ErrorCodeRegistry.HAPROXY_PODS_NOT_FOUND,
      troubleshootingSteps:
        'Check HAProxy pod status: kubectl get pods -n <namespace> -l solo.hedera.com/type=haproxy\n' +
        'Check the active deployment: solo deployment config info --deployment <name>\n' +
        'Redeploy the network if HAProxy is missing: solo consensus network deploy',
    });
  }
}
