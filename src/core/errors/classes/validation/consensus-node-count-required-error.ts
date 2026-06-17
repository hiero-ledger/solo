// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the consensus node count flag is required but missing; the message names the flag and the
 * phase in which it is needed. solo needs to know how many consensus nodes to act on, so this means the
 * flag must be supplied at that phase.
 */
export class ConsensusNodeCountRequiredError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(flagName: string, phase: string) {
    super({
      message: `--${flagName} must be specified ${phase}`,
      code: ErrorCodeRegistry.CONSENSUS_NODE_COUNT_REQUIRED,
      troubleshootingSteps: `Specify the number of consensus nodes using the --${flagName} flag, e.g. --${flagName} 3`,
    });
  }
}
