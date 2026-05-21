// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class KubeContextNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(nodeAlias: string) {
    super({
      message: `Unable to determine Kubernetes context for node ${nodeAlias}`,
      code: ErrorCodeRegistry.KUBE_CONTEXT_NOT_FOUND,
      troubleshootingSteps:
        'Check cluster references: solo deployment config view\nVerify that the node alias is registered in remote config: kubectl get configmap -n solo\nReview logs: tail -f ~/.solo/logs/solo.log | jq',
    });
  }
}
