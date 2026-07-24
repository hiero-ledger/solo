// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BlockNodesJsonEmptySoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(nodeAlias: string, cause?: Error) {
    super(
      {
        message: `block-nodes.json for consensus node ${nodeAlias} has no block node entries`,
        code: ErrorCodeRegistry.BLOCK_NODES_JSON_EMPTY,
        troubleshootingSteps:
          'Ensure at least one block node is deployed: solo block-node deploy\n' +
          'Check the block node mapping flags: --block-node-mapping or --external-block-node-mapping\n' +
          'List all registered components: solo deployment config info\n' +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
