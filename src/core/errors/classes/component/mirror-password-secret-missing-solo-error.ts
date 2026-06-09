// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
