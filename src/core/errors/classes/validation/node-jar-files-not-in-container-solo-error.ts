// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeJarFilesNotInContainerSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(nodeAlias: string, directoryPath: string) {
    super({
      message: `Node '${nodeAlias}': no JAR files found in ${directoryPath}. Ensure platform software was copied to the node before starting.`,
      code: ErrorCodeRegistry.NODE_JAR_FILES_NOT_IN_CONTAINER,
      troubleshootingSteps:
        'Run setup before starting: solo node setup\nVerify the directory inside the pod: kubectl exec <pod> -n <namespace> -- ls <directoryPath>\nRe-copy platform software: solo node setup --local-build-path <path>',
    });
  }
}
