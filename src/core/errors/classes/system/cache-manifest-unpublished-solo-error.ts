// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when no image cache manifest has been published for the running Solo version; the message
 * names the manifest URL. Solo reads this manifest to learn which image archives to download, so this means
 * the release has no manifest published asset — an expected condition for releases or versions where the
 * manifest has not been published.
 */
export class CacheManifestUnpublishedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(url: string, cause?: Error) {
    super(
      {
        message: `Image cache manifest is not published: ${url}`,
        code: ErrorCodeRegistry.CACHE_MANIFEST_UNPUBLISHED,
        troubleshootingSteps:
          'Solo can run without an image cache; missing images will be pulled directly from their registries.\n' +
          'To use a custom image cache manifest, set the SOLO_CACHE_MANIFEST_URL environment variable.',
      },
      cause,
    );
  }
}
