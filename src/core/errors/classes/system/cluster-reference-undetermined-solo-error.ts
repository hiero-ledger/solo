// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ClusterReferenceUndeterminedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor() {
    super({
      message: 'Error during initialization, cluster reference could not be determined',
      code: ErrorCodeRegistry.CLUSTER_REF_UNDETERMINED,
      troubleshootingSteps:
        'Check the remote config: kubectl get configmap -n solo -o yaml\nVerify cluster references: solo deployment config view\nRe-initialize the deployment: solo deployment init\nReview logs: tail -f ~/.solo/logs/solo.log | jq',
    });
  }
}
