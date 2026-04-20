// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {SoloErrorCode} from '../solo-error-code.js';

export class LocalConfigNotFoundSoloError extends SoloError {
  public constructor(cause?: Error) {
    super(...SoloError.resolveCodeArgs(SoloErrorCode.LOCAL_CONFIG_NOT_FOUND, {}, cause));
  }
}
