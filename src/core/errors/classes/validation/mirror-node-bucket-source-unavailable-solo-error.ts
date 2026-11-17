// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a mirror node in a cluster without consensus nodes would import from the bucket. Such a
 * cluster has no storage credentials, so the importer could only fail later, at download time. It needs a block node
 * in the same cluster as its source.
 */
export class MirrorNodeBucketSourceUnavailableSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterReference: string) {
    super({
      message: `The mirror node cannot import from the bucket in cluster ${clusterReference}: it has no consensus nodes and so no storage credentials`,
      code: ErrorCodeRegistry.MIRROR_NODE_BUCKET_SOURCE_UNAVAILABLE,
      troubleshootingSteps:
        'Deploy a block node in the same cluster first: solo block node add\n' +
        'Then use --mirror-node-source block-node\n' +
        'Or deploy the mirror node in a cluster that has consensus nodes',
    });
  }
}
