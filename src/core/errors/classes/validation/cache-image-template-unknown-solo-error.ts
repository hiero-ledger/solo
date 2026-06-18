// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a cache image template key is not recognized; the message names the key. solo resolves image
 * versions against a known set of template keys, so this means the supplied key is not one of them — for
 * example a typo or an unsupported template.
 */
export class CacheImageTemplateUnknownSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(key: string) {
    super({
      message: `Unknown cache image template key: ${key}`,
      code: ErrorCodeRegistry.CACHE_IMAGE_TEMPLATE_UNKNOWN,
      troubleshootingSteps:
        'Verify the cache image template key is correct in your configuration\n' +
        'Declare the template in the templates section before using it in version fields',
    });
  }
}
