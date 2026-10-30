// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a key passed with --admin-public-keys is not a DER encoded ED25519 public key; the message
 * names the node the key was given for. solo writes these keys into the genesis network as each node's admin key, so
 * it rejects one it cannot parse rather than replacing it with a key the operator did not choose.
 */
export class InvalidAdminPublicKeySoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(nodeAlias: string) {
    super({
      message: `The admin public key given for ${nodeAlias} is not a DER encoded ED25519 public key.`,
      code: ErrorCodeRegistry.INVALID_ADMIN_PUBLIC_KEY,
      troubleshootingSteps:
        `Check the key given for ${nodeAlias} in --admin-public-keys; keys are matched to nodes in node alias order\n` +
        'Give the DER encoded form of an ED25519 public key (it starts with 302a300506032b6570032100)\n' +
        'Run solo consensus node setup --help for usage information',
    });
  }
}
