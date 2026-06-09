// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class PlatformFileCopyFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(sourceFiles: string[], podName: string, destinationDirectory: string, cause: Error) {
    super(
      {
        message: `Failed to copy files ${sourceFiles.join(', ')} to ${podName}:${destinationDirectory}: ${cause.message}`,
        code: ErrorCodeRegistry.PLATFORM_FILE_COPY_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Verify the pod is running: kubectl get pod ${podName} -n <namespace>\n` +
          'Check available disk space in the pod\n' +
          'Inspect pod logs: kubectl logs <node-pod> -n <namespace>',
      },
      cause,
    );
  }
}
