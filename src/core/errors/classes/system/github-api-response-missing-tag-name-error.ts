// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class GitHubApiResponseMissingTagNameError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(url: string) {
    super(
      {
        message: `GitHub API response from ${url} is missing tag_name`,
        code: ErrorCodeRegistry.GITHUB_API_RESPONSE_MISSING_TAG_NAME,
        troubleshootingSteps:
          'Confirm the repository has a latest release and that the GitHub API response contains expected release fields.',
      },
      {},
      {url},
    );
  }
}
