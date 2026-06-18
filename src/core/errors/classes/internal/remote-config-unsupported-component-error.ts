// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the remote configuration contains a component whose type solo does
 * not recognise; the message reports the offending `componentType`. solo dispatches on the
 * component type when reading the remote config's component inventory, and raises this for any
 * value outside the known set. It usually means the remote config was written by an
 * incompatible solo version or was hand-edited into an invalid state, and is treated as an
 * internal defect.
 */
export class RemoteConfigUnsupportedComponentError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(componentType: string) {
    super({
      message: `Unsupported component type in remote configuration: ${componentType}`,
      code: ErrorCodeRegistry.REMOTE_CONFIG_UNSUPPORTED_COMPONENT,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
