// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';

export class RemoteConfigsMismatchSoloError extends SoloError {
  public constructor(cluster1: string, cluster2: string, cause?: Error) {
    super(
      {
        messageKey: 'remote_configs_mismatch_message',
        code: ErrorCodeRegistry.REMOTE_CONFIGS_MISMATCH,
        troubleshootingKey: 'remote_configs_mismatch_troubleshooting_steps',
        context: {cluster1, cluster2},
      },
      cause,
    );
  }
}
