// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
