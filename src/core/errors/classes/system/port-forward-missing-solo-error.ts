// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a configured port-forward is not present; the message names the component, its id, and the
 * local-to-pod port mapping. solo expects each configured port-forward to be active so the component is
 * reachable, so this means it is missing — for example it was never established or was dropped. It is
 * retryable, since re-establishing the port-forward often succeeds.
 */
export class PortForwardMissingSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(componentDisplayName: string, componentId: number, localPort: number, podPort: number) {
    super({
      message: `Configured port-forward is missing: ${componentDisplayName} ${componentId} localhost:${localPort} -> pod:${podPort}`,
      code: ErrorCodeRegistry.PORT_FORWARD_MISSING,
      troubleshootingSteps:
        'Check port-forward status: solo deployment diagnostics connections --deployment <name>\n' +
        'Re-establish port forwards: solo consensus node start\n' +
        'Verify the pod is running: kubectl get pods -n <namespace>',
    });
  }
}
