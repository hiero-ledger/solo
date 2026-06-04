// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
