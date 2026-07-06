// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a component of a given type and id is not present in the remote configuration; the message
 * names both. solo expected the component to be recorded, so its absence here indicates an internal
 * inconsistency and is treated as an internal Solo error.
 */
export class ComponentNotInRemoteConfigSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(type: string, id: string) {
    super({
      message: `Component of type '${type}' with id '${id}' was not found in remote configuration`,
      code: ErrorCodeRegistry.COMPONENT_NOT_IN_REMOTE_CONFIG,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
