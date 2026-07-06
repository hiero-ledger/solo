// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot configure access to a consensus node; the underlying failure is wrapped in
 * `cause`. This step establishes the connection (such as a port-forward) and credentials needed to reach a
 * node, so this means that configuration failed — for example the node pod or service was not reachable, or
 * a required port-forward could not be created.
 */
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
