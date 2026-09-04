// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when no JAR files are found in the expected directory inside a node container; the message names
 * the node alias and the directory. The platform software should have been copied to the node before
 * starting it, so their absence indicates an internal ordering or setup defect and is treated as an
 * internal Solo error.
 */
export class NodeJarFilesNotInContainerSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(nodeAlias: string, directoryPath: string) {
    super({
      message: `Node '${nodeAlias}': no JAR files found in ${directoryPath}. Ensure platform software was copied to the node before starting.`,
      code: ErrorCodeRegistry.NODE_JAR_FILES_NOT_IN_CONTAINER,
      troubleshootingSteps:
        'Run setup before starting: solo consensus node setup\n' +
        'Verify the directory inside the pod: kubectl exec <pod> -n <namespace> -- ls <directoryPath>\n' +
        'Re-copy platform software: solo consensus node setup --local-build-path <path>',
    });
  }
}
