// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo has rotated a consensus node's admin key on the network but could not save the new key
 * in the node's admin key secret, even after retrying. The network already requires the new key, and this error is
 * the only place it still exists, so the message carries the key and the troubleshooting steps recreate the secret
 * from it. Without that secret every later rotation of the node fails with INVALID_SIGNATURE.
 */
export class NodeAdminKeySaveFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(
    nodeAlias: string,
    secretName: string,
    namespace: string,
    context: string,
    privateKey: string,
    publicKey: string,
    cause?: Error,
  ) {
    const kubectl: string = `kubectl --context ${context} -n ${namespace}`;
    super(
      {
        message:
          `The admin key of ${nodeAlias} was rotated on the network, but saving it in secret ${secretName} failed. ` +
          `This is the only copy of the new admin key, keep it: ${privateKey}`,
        code: ErrorCodeRegistry.NODE_ADMIN_KEY_SAVE_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify RBAC permissions allow secret creation in the namespace\n' +
          `Recreate the secret: ${kubectl} create secret generic ${secretName} ` +
          `--from-literal=privateKey=${privateKey} --from-literal=publicKey=${publicKey} ` +
          `--dry-run=client -o yaml | ${kubectl} apply -f -\n` +
          `Label it: ${kubectl} label secret ${secretName} solo.hedera.com/node-admin-key=true --overwrite`,
      },
      cause,
    );
  }
}
