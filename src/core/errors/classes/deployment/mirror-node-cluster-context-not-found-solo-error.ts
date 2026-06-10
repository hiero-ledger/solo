// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class MirrorNodeClusterContextNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(mirrorNodeId: string) {
    super({
      message: `No cluster context found for mirror node ${mirrorNodeId}`,
      code: ErrorCodeRegistry.MIRROR_NODE_CLUSTER_CONTEXT_NOT_FOUND,
      troubleshootingSteps:
        'List registered cluster references: solo cluster-ref config list\n' +
        'Verify the mirror node is associated with a registered cluster\n' +
        'Check deployment configuration: solo deployment config info',
    });
  }
}
