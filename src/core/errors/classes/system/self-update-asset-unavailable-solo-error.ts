// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the release checksum manifest does not list the SEA binary for this platform; the message names the release and the asset. Nothing on disk was replaced.
 */
export class SelfUpdateAssetUnavailableSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(tag: string, assetName: string, cause?: Error) {
    super(
      {
        message: `Release ${tag} has no Solo binary for this machine (${assetName})`,
        code: ErrorCodeRegistry.SELF_UPDATE_ASSET_UNAVAILABLE,
        troubleshootingSteps:
          'Install through npm instead: npm install -g @hiero-ledger/solo@<version>\n' +
          'Pick another release: solo update --target-version <tag>',
      },
      cause,
    );
  }
}
