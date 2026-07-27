// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a local block node image with the given tag does not exist; the message names the tag. solo
 * expects the referenced local image to be present (for example built or loaded into the cluster), so this
 * means it is missing — build or load the image, or correct the tag.
 */
export class BlockNodeLocalImageNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(imageTag: string) {
    super({
      message: `Local block node image with tag "${imageTag}" does not exist`,
      code: ErrorCodeRegistry.BLOCK_NODE_LOCAL_IMAGE_NOT_FOUND,
      troubleshootingSteps:
        `Verify the image exists locally: docker images | grep ${imageTag}\n` +
        `Pull the image if missing: docker pull <registry>/block-node:${imageTag}\n` +
        'Ensure the tag is a valid semantic version',
    });
  }
}
