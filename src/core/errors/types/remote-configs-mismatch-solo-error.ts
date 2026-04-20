// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {SoloErrorCode} from '../solo-error-code.js';

export class RemoteConfigsMismatchSoloError extends SoloError {
  public constructor(cluster1: string, cluster2: string, cause?: Error) {
    super(...SoloError.resolveCodeArgs(SoloErrorCode.REMOTE_CONFIGS_MISMATCH, {cluster1, cluster2}, cause));
  }
}
