// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `consensus node add` is run against a deployment that has no consensus nodes. Adding a node
 * requires an existing network to submit the node create transaction to, so the first nodes must be deployed with
 * `consensus network deploy`.
 */
export class NoConsensusNodesForNodeAddSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(deployment: string) {
    super({
      message: `Deployment '${deployment}' has no consensus nodes; 'consensus node add' requires an existing network`,
      code: ErrorCodeRegistry.NO_CONSENSUS_NODES_FOR_NODE_ADD,
      troubleshootingSteps:
        `Deploy the initial consensus nodes with: solo consensus network deploy --deployment ${deployment}\n` +
        `Then start them with: solo consensus node start --deployment ${deployment}\n` +
        "Use 'consensus node add' only after the network is running.",
    });
  }
}
