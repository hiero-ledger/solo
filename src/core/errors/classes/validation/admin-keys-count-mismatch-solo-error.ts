// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class AdminKeysCountMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(adminKeysCount: number, nodesCount: number) {
    super({
      message:
        `Admin public keys count (${adminKeysCount}) does not match consensus nodes count (${nodesCount}). ` +
        'Provide a comma-separated list of DER encoded ED25519 public keys, one per node.',
      code: ErrorCodeRegistry.ADMIN_KEYS_COUNT_MISMATCH,
      troubleshootingSteps:
        `Provide exactly ${nodesCount} comma-separated DER encoded ED25519 public keys, one for each consensus node\n` +
        'Run solo consensus network deploy --help for usage information',
    });
  }
}
