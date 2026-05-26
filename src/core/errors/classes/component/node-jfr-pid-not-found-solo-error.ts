// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeJfrPidNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(podName: string) {
    super({
      message: `Could not find process ID for ServicesMain in node pod ${podName}`,
      code: ErrorCodeRegistry.NODE_JFR_PID_NOT_FOUND,
      troubleshootingSteps:
        'Verify the consensus node is running inside the pod: kubectl exec <podName> -- ps axww -o pid,command\n' +
        'Check node startup logs: kubectl logs <podName> -n <namespace>\n' +
        'Restart the node if ServicesMain is absent: solo consensus node restart',
    });
  }
}
