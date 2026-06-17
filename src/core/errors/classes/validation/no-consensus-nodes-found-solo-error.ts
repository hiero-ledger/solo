// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when no consensus nodes are found to operate on. solo derives the node set from the deployment and
 * `--node-aliases`, so this means neither yielded any nodes — check your deployment or the `--node-aliases`
 * input.
 */
export class NoConsensusNodesFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'No consensus nodes found. Check your deployment or --node-aliases input.',
      code: ErrorCodeRegistry.NO_CONSENSUS_NODES_FOUND,
      troubleshootingSteps:
        'Verify the deployment has consensus nodes configured: solo deployment config info\n' +
        'Deploy consensus nodes: solo consensus node setup\n' +
        'Use --node-aliases to specify target nodes explicitly',
    });
  }
}
