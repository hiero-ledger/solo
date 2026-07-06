// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot determine the Kubernetes context for a node; the message names the node alias. By
 * this point the node context should already be resolvable from configuration, so reaching it indicates an
 * internal inconsistency and is treated as an internal Solo error.
 */
export class KubeContextNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(nodeAlias: string) {
    super({
      message: `Unable to determine Kubernetes context for node ${nodeAlias}`,
      code: ErrorCodeRegistry.KUBE_CONTEXT_NOT_FOUND,
      troubleshootingSteps:
        'Check active deployments: solo deployment config info\n' +
        'Verify that the node alias is registered: kubectl get configmap -n <namespace> -o yaml\n' +
        'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
