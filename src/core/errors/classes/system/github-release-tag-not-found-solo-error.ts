// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class GitHubReleaseTagNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(tagName: string) {
    super({
      message: `GitHub release not found for tag '${tagName}'`,
      code: ErrorCodeRegistry.GITHUB_RELEASE_TAG_NOT_FOUND,
      troubleshootingSteps:
        `Verify the release tag '${tagName}' exists in the GitHub repository\n` +
        'Check the GitHub releases page for available versions\n' +
        'Verify network connectivity to api.github.com',
    });
  }
}
