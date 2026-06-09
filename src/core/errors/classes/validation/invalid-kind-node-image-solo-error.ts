// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
