// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';
import {LocaleRegistry} from '../../locales/locale-registry.js';

export class RemoteConfigsMismatchSoloError extends SoloError {
  protected override readonly code: string = ErrorCodeRegistry.REMOTE_CONFIGS_MISMATCH;
  protected override readonly messageKey: string = 'remote_configs_mismatch_message';
  protected override readonly troubleshootingKey: string = 'remote_configs_mismatch_troubleshooting_steps';

  public constructor(cluster1: string, cluster2: string, cause?: Error) {
    super(LocaleRegistry.getMessage('remote_configs_mismatch_message', {cluster1, cluster2}), cause);
  }
}
