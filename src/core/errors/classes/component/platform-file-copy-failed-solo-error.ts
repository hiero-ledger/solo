// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot copy platform files into a consensus node pod; the message names the source
 * files, the pod, and the destination directory, and wraps the underlying failure in `cause`. solo copies
 * platform artifacts into the node container during setup, so this means the copy failed — for example the
 * pod was not reachable, the destination path was not writable, or the connection dropped mid-copy.
 */
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
