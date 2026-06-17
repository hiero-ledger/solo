// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo looks up a consensus node by alias but it is not present in the configuration; the
 * message names the alias. By this point the node should already be known, so reaching it indicates an
 * internal inconsistency between the requested alias and the loaded configuration, and is treated as an
 * internal Solo error.
 */
export class ConsensusNodeNotInConfigSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(nodeAlias: string) {
    super({
      message: `Consensus node not found for alias: ${nodeAlias}`,
      code: ErrorCodeRegistry.CONSENSUS_NODE_NOT_IN_CONFIG,
      troubleshootingSteps:
        'List registered nodes: solo deployment config info --deployment <name>\n' +
        'Verify the node alias: kubectl get configmap -n <namespace> -o yaml | grep nodeAlias\n' +
        'Re-run with a valid alias: solo node <command> --node-aliases <alias>',
    });
  }
}
