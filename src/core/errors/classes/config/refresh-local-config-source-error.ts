// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class RefreshLocalConfigSourceError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(message: string, cause?: Error) {
    super({message, code: ErrorCodeRegistry.REFRESH_LOCAL_CONFIG_SOURCE}, cause);
  }
}
