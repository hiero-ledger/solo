// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when remote-configuration access needs a Kubernetes context to reach the
 * cluster but none is available: no context was passed to the call and solo could not fall
 * back to a default one (for example because the current kubeconfig has no current-context to
 * resolve). Because callers are expected to supply or have already resolved a context by this
 * point, reaching it indicates a broken internal assumption in solo rather than a user error.
 */
export class RemoteConfigContextUnavailableError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor() {
    super({
      message: "Context is not passed and the default context can't be acquired",
      code: ErrorCodeRegistry.REMOTE_CONFIG_CONTEXT_UNAVAILABLE,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
