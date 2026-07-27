// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a GitHub API response is missing the expected `tag_name` field; the message names the URL.
 * solo reads `tag_name` to identify a release version, so this means the response came back without it —
 * indicating an unexpected response shape from the API.
 */
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
