// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';
import {LocaleRegistry} from '../../locales/locale-registry.js';

export class LocalConfigNotFoundSoloError extends SoloError {
  protected override readonly code: string = ErrorCodeRegistry.LOCAL_CONFIG_NOT_FOUND;
  protected override readonly messageKey: string = 'local_config_not_found_message';
  protected override readonly troubleshootingKey: string = 'local_config_not_found_troubleshooting_steps';

  public constructor(cause?: Error) {
    super(LocaleRegistry.getMessage('local_config_not_found_message'), cause);
  }
}
