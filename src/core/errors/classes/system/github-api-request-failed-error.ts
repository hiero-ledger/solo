// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a GitHub API request cannot be completed; the message names the URL and wraps the underlying
 * failure in `cause`. The request did not produce a usable HTTP response at all — for example a network or
 * DNS failure, or a dropped connection. It is retryable, since transient network problems often clear on a
 * later attempt.
 */
export class GitHubApiRequestFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(url: string, cause: Error | unknown = {}) {
    super(
      {
        message: `GitHub API request to ${url} failed`,
        code: ErrorCodeRegistry.GITHUB_API_REQUEST_FAILED,
        troubleshootingSteps:
          'Check network connectivity and GitHub availability, then retry. If the issue persists, confirm proxy/firewall settings.',
      },
      cause,
      {url},
    );
  }
}
