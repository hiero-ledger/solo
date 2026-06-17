// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown while rendering cache image targets when a version field holds a value
 * that looks like a template key (all uppercase letters, digits, and underscores) but is not
 * among the declared templates; the message names the offending key. The renderer treats such
 * a value as a reference to a named template and refuses to emit it verbatim, so the key must
 * first be declared in the template set. Reaching it points to a missing template declaration
 * in solo's configuration rather than to user input.
 */
export class CacheImageTemplateUndeclaredError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(template: string) {
    super({
      message: `Undeclared cache image template key used in version field: ${template}. Add it to templates first.`,
      code: ErrorCodeRegistry.CACHE_IMAGE_TEMPLATE_UNDECLARED,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
