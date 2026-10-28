// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {type NodeAlias} from '../../../../types/aliases.js';

/**
 * @description Thrown when an admin public key provided via --admin-public-keys is not a valid DER-encoded ED25519
 * public key; the message reports the invalid key string and the node alias. solo only supports ED25519
 * admin keys, so ECDSA or malformed inputs are rejected.
 */
export class InvalidAdminPublicKeySoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(key: string, nodeAlias?: NodeAlias, cause?: unknown) {
    super(
      {
        message: nodeAlias
          ? `Failed to parse admin public key for node '${nodeAlias}': '${key}'. ` +
            'Provide a valid DER-encoded ED25519 public key in hexadecimal format.'
          : `Failed to parse admin public key: '${key}'. ` +
            'Provide a valid DER-encoded ED25519 public key in hexadecimal format.',
        code: ErrorCodeRegistry.INVALID_ADMIN_PUBLIC_KEY,
        troubleshootingSteps:
          'Provide a valid DER-encoded ED25519 public key in hexadecimal format for each consensus node\n' +
          'Note that ECDSA keys are not supported for node admin keys\n' +
          'Run solo consensus network deploy --help for usage information',
      },
      cause,
    );
  }
}
