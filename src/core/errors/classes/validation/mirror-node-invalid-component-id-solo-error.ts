// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {SOLO_REMOTE_CONFIGMAP_NAME} from '../../../constants.js';

export class MirrorNodeInvalidComponentIdSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(id: unknown) {
    super({
      message: `Invalid mirror node component id: ${String(id)}, type: ${typeof id}`,
      code: ErrorCodeRegistry.MIRROR_NODE_INVALID_COMPONENT_ID,
      troubleshootingSteps:
        `Inspect remote config state for corruption: kubectl get configmap ${SOLO_REMOTE_CONFIGMAP_NAME} -n <namespace> -o yaml\n` +
        'Check solo logs for config loading errors: tail -n 100 ~/.solo/logs/solo.log\n' +
        'If the issue persists, this may be an internal bug — report it with your solo log',
    });
  }
}
