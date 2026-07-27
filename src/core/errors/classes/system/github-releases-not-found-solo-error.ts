// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a GitHub repository reports no releases. solo lists releases to choose a version to download,
 * so this means the repository returned an empty release list. It is retryable, since a transient API issue
 * can return empty results that resolve on a later attempt.
 */
export class GitHubReleasesNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'No releases found in the GitHub repository',
      code: ErrorCodeRegistry.GITHUB_RELEASES_NOT_FOUND,
      troubleshootingSteps:
        'Verify network connectivity and GitHub availability\n' +
        'Check if GitHub API rate limits have been exceeded\n' +
        'Verify proxy or firewall settings allow access to api.github.com',
    });
  }
}
