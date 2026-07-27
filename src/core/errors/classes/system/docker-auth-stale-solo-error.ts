// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo detects stale Docker authentication for the GitHub Container Registry (GHCR). solo needs
 * valid GHCR credentials to pull images, so this means the cached Docker auth is expired or invalid —
 * re-authenticate to GHCR to refresh it.
 */
export class DockerAuthStaleSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'GHCR stale Docker authentication detected',
      code: ErrorCodeRegistry.DOCKER_AUTH_STALE,
      troubleshootingSteps:
        'Re-authenticate with the GitHub Container Registry: docker login ghcr.io\n' +
        'Verify your GitHub Personal Access Token has the read:packages scope\n' +
        'Clear stale credentials: docker logout ghcr.io',
    });
  }
}
