// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeAccessConfigFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to configure node access: ${cause.message}`,
        code: ErrorCodeRegistry.NODE_ACCESS_CONFIG_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify consensus node pods are running: kubectl get pods -n <namespace>\n' +
          'Check node logs: kubectl logs <node-pod> -n <namespace>\n' +
          'Restart the consensus node: solo consensus node restart',
      },
      cause,
    );
  }
}
