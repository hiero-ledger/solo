// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class RealmShardVersionConstraintSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(minimumVersion: string) {
    super({
      message: `The realm and shard values must be 0 when using a network node version older than ${minimumVersion}`,
      code: ErrorCodeRegistry.REALM_SHARD_VERSION_CONSTRAINT,
      troubleshootingSteps:
        'Use realm=0 and shard=0: solo network deploy --realm 0 --shard 0\nOr upgrade to network node >= <minimumVersion>: solo node upgrade --upgrade-version <version>',
    });
  }
}
