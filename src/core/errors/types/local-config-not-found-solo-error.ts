// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';

export class LocalConfigNotFoundSoloError extends SoloError {
  public constructor(cause?: Error) {
    super(
      {
        localeKey: 'local_config_not_found',
        code: ErrorCodeRegistry.LOCAL_CONFIG_NOT_FOUND,
      },
      cause,
    );
  }
}
