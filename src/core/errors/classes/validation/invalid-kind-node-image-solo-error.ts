// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a Kind node image reference is invalid; the message includes the offending value. solo uses
 * this image to create the Kind cluster nodes, so this means the reference is malformed — provide a valid
 * image reference.
 */
export class InvalidKindNodeImageSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(image: string) {
    super({
      message: `Invalid Kind node image reference: ${image}`,
      code: ErrorCodeRegistry.INVALID_KIND_NODE_IMAGE,
      troubleshootingSteps:
        'Provide a valid Kind node image reference (e.g., kindest/node:v1.27.0)\n' +
        'Check the Kind documentation for supported image formats',
    });
  }
}
