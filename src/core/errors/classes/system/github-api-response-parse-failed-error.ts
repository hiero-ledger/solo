// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class GitHubApiResponseParseFailedError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(url: string, cause: Error | unknown = {}) {
    super(
      {
        message: `Failed to parse GitHub API response from ${url}`,
        code: ErrorCodeRegistry.GITHUB_API_RESPONSE_PARSE_FAILED,
        troubleshootingSteps: 'Inspect the GitHub API response shape and endpoint contract.',
      },
      cause,
      {url},
    );
  }
}
