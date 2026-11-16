// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the relayNode section of a one-shot values file sets a --chain-id that differs from the
 * chain ID of the consensus node. EVM tooling such as Hardhat rejects a relay whose chain ID does not match the network.
 */
export class ChainIdMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(consensusChainId: string, relayChainId: string) {
    super({
      message: `The relay chain ID ${relayChainId} does not match the consensus node chain ID ${consensusChainId}`,
      code: ErrorCodeRegistry.CHAIN_ID_MISMATCH,
      troubleshootingSteps:
        'Remove --chain-id from the relayNode section of the values file so the relay uses the consensus node chain ID\n' +
        'Or set the same --chain-id in the network and relayNode sections of the values file\n' +
        'Without --chain-id in the network section, the consensus node uses SOLO_CHAIN_ID, or 298 when it is unset',
    });
  }
}
