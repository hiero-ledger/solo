// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the mirror node database owner credential is absent from the expected secret — specifically
 * `MIRROR_IMPORTER_DB_OWNER` is not present in the `mirror-passwords` secret. solo reads this secret to
 * obtain the importer's database owner, so this means the secret exists without the required key, or was
 * not populated as expected during deployment.
 */
export class MirrorPasswordSecretMissingSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'Could not find MIRROR_IMPORTER_DB_OWNER in mirror-passwords secret',
      code: ErrorCodeRegistry.MIRROR_PASSWORD_SECRET_MISSING,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Inspect the mirror-passwords secret: kubectl get secret mirror-passwords -n <namespace> -o jsonpath="{.data}"\n' +
        'Re-deploy the mirror node to recreate secrets: solo mirror node add',
    });
  }
}
