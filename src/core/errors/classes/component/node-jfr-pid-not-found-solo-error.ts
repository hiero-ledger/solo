// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot find the `ServicesMain` process id inside a consensus node pod; the message names
 * the pod. JFR profiling must attach to the running node process, so this is raised when that process
 * cannot be located — which points to an unexpected container state or a defect in how solo locates the
 * process, and is treated as an internal Solo error.
 */
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
