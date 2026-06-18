// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot resolve the Kubernetes service for a specific consensus node; the message names
 * the node alias. solo expects each node to expose a service it can reach, so this is raised when no
 * matching service is found — typically because the node alias does not correspond to a deployed node, or
 * the selected deployment or namespace does not contain it.
 */
export class NodeServiceNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(nodeAlias: string) {
    super({
      message: `Failed to resolve node service for node '${nodeAlias}'`,
      code: ErrorCodeRegistry.NODE_SERVICE_NOT_FOUND,
      troubleshootingSteps:
        `Verify that node '${nodeAlias}' exists in the deployment: solo deployment info\n` +
        'List all node services in the namespace: kubectl get svc -n <namespace>\n' +
        'Check that the consensus node pod is running: kubectl get pods -n <namespace> -l app=<node-alias>\n' +
        'Check solo logs for more context: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
