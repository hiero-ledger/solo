// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot inspect the Podman machine; the underlying failure is wrapped in `cause`. When
 * using Podman, solo inspects the machine to read its configuration, so this means that inspection failed —
 * for example Podman is not installed, the machine is not running, or the command errored.
 */
export class PodmanMachineInspectFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to inspect Podman machine: ${cause.message}`,
        code: ErrorCodeRegistry.PODMAN_MACHINE_INSPECT_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify Podman is installed: podman --version\n' +
          'List Podman machines: podman machine list\n' +
          'Start the Podman machine if it is not running: podman machine start',
      },
      cause,
    );
  }
}
