// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo has rotated a consensus node's admin key on the network but could not save the new key
 * in the node's admin key secret, even after retrying. The network already requires the new key, so solo writes the
 * secret to a recovery manifest (or prints it, when even that fails) and this error says how to apply it. The key is
 * never part of this error, which is written to the solo log. Without that secret every later rotation of the node
 * fails with INVALID_SIGNATURE.
 */
export class NodeAdminKeySaveFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  /**
   * @param nodeAlias - the node whose admin key was rotated
   * @param secretName - the admin key secret that could not be saved
   * @param context - the cluster context the secret belongs in, or undefined for the current context
   * @param recoveryFile - the manifest holding the secret, or undefined when it was printed to standard error instead
   * @param cause - the last error saving the secret
   */
  public constructor(
    nodeAlias: string,
    secretName: string,
    context: string | undefined,
    recoveryFile: string | undefined,
    cause?: Error,
  ) {
    const kubectl: string = context ? `kubectl --context ${context}` : 'kubectl';
    const keyLocation: string = recoveryFile
      ? `was written to ${recoveryFile}`
      : 'was printed above as a secret manifest, and is not in the solo log: save it now';
    super(
      {
        message:
          `The admin key of ${nodeAlias} was rotated on the network, but saving it in secret ${secretName} failed. ` +
          `The new key, which the network now requires, ${keyLocation}.`,
        code: ErrorCodeRegistry.NODE_ADMIN_KEY_SAVE_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify RBAC permissions allow secret creation in the namespace\n' +
          (recoveryFile
            ? `Recreate the secret: ${kubectl} apply -f ${recoveryFile}\n` +
              `Delete ${recoveryFile} once the secret exists, as it holds the private key`
            : `Recreate the secret: save the printed manifest to a file and run ${kubectl} apply -f <file>`),
      },
      cause,
    );
  }
}
