// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when no GitHub release asset matches the running platform and architecture; the message names the
 * platform and arch. solo selects the release asset built for the current OS and CPU, so this means the
 * release exists but has no matching asset — for example the platform or architecture is unsupported by
 * that release.
 */
export class GitHubReleaseAssetNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(platform: string, arch: string) {
    super({
      message: `No matching GitHub release asset found for platform '${platform}' and architecture '${arch}'`,
      code: ErrorCodeRegistry.GITHUB_RELEASE_ASSET_NOT_FOUND,
      troubleshootingSteps:
        `Verify a release asset is available for your platform (${platform}) and architecture (${arch})\n` +
        'Check the GitHub releases page for supported platforms\n' +
        'Consider installing the dependency manually',
    });
  }
}
