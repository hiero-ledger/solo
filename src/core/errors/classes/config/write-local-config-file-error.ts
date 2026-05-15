// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class WriteLocalConfigFileError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(message: string, cause?: Error) {
    super({message, code: ErrorCodeRegistry.WRITE_LOCAL_CONFIG}, cause);
  }
}
