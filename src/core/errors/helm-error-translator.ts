// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './solo-errors.js';
import {type SoloError} from './solo-error.js';
import {HelmDockerAuthStaleException} from '../../integration/helm/helm-docker-auth-stale-exception.js';

export class HelmErrorTranslator {
  /**
   * Attempts to translate a helm integration error into the corresponding SoloError.
   * Returns the translated SoloError, or undefined if the error is not a known helm type.
   */
  public static tryTranslate(error: unknown): SoloError | undefined {
    if (error instanceof HelmDockerAuthStaleException) {
      return new SoloErrors.system.dockerAuthStale();
    }
    return undefined;
  }
}
