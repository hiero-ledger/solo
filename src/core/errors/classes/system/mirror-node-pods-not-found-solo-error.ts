// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class MirrorNodePodsNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(releaseName: string, namespace: string) {
    super({
      message: `No deployed mirror-node pods found for release ${releaseName} in namespace ${namespace}`,
      code: ErrorCodeRegistry.MIRROR_NODE_PODS_NOT_FOUND,
      troubleshootingSteps:
        `Check pod status: kubectl get pods -n ${namespace} | grep ${releaseName}\n` +
        `Inspect Helm release: helm status ${releaseName} -n ${namespace}`,
    });
  }
}
