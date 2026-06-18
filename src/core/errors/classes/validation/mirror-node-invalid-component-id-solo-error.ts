// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a mirror node component id is not valid; the message includes the value and its runtime type.
 * solo expects component ids in a specific form, so this means the supplied id is malformed or of the wrong
 * type.
 */
export class MirrorNodeInvalidComponentIdSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(id: unknown) {
    super({
      message: `Invalid mirror node component id: ${String(id)}, type: ${typeof id}`,
      code: ErrorCodeRegistry.MIRROR_NODE_INVALID_COMPONENT_ID,
      troubleshootingSteps:
        'Inspect remote config state for corruption: kubectl get configmap solo-remote-config -n <namespace> -o yaml\n' +
        'Check solo logs for config loading errors: tail -n 100 ~/.solo/logs/solo.log\n' +
        'If the issue persists, this may be an internal bug — report it with your solo log',
    });
  }
}
