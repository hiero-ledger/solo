// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a GitHub API request returns a non-success HTTP status; the message names the URL and the
 * status code. solo calls the GitHub API to discover releases and download assets, so this means GitHub
 * responded with an error status — for example rate limiting, a missing resource, or a server error. It is
 * retryable, since transient statuses such as rate limits often clear on a later attempt.
 */
export class GitHubApiHttpResponseError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(url: string, status: number) {
    super(
      {
        message: `GitHub API request to ${url} returned HTTP ${status}`,
        code: ErrorCodeRegistry.GITHUB_API_HTTP_RESPONSE_ERROR,
        troubleshootingSteps: 'Verify GitHub API accessibility and credentials/rate limits, then retry.',
      },
      {},
      {url, status},
    );
  }
}
