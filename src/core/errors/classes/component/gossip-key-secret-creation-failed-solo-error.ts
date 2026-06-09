// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class GossipKeySecretCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(nodeAlias: string, additionalMessage?: string, cause?: Error) {
    super(
      {
        message: `Failed to create Kubernetes secret for gossip keys for node '${nodeAlias}'`,
        code: ErrorCodeRegistry.GOSSIP_KEY_SECRET_CREATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Check existing secrets: kubectl get secrets -n <namespace>\n' +
          'Verify RBAC permissions allow secret creation in the namespace\n' +
          'Re-run node setup: solo consensus node setup',
      },
      cause,
    );
  }
}
