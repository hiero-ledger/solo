// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ConsensusCommandDefinition} from '../../../../commands/command-definitions/consensus-command-definition.js';

export class NodeJarFilesNotInContainerSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(nodeAlias: string, directoryPath: string) {
    super({
      message: `Node '${nodeAlias}': no JAR files found in ${directoryPath}. Ensure platform software was copied to the node before starting.`,
      code: ErrorCodeRegistry.NODE_JAR_FILES_NOT_IN_CONTAINER,
      troubleshootingSteps:
        `Run setup before starting: solo ${ConsensusCommandDefinition.SETUP_COMMAND}\n` +
        'Verify the directory inside the pod: kubectl exec <pod> -n <namespace> -- ls <directoryPath>\n' +
        `Re-copy platform software: solo ${ConsensusCommandDefinition.SETUP_COMMAND} ${Flags.getFormattedFlagKey(Flags.localBuildPath)} <path>`,
    });
  }
}
