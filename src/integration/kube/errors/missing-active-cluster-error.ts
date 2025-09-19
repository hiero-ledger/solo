// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../core/errors/solo-error.js';

export class MissingActiveClusterError extends SoloError {
  public static MISSING_ACTIVE_CLUSTER =
    'No active kubernetes cluster found. Please create a cluster and set current context.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause?: Error, meta?: object) {
    super(MissingActiveClusterError.MISSING_ACTIVE_CLUSTER, cause, meta);
  }
}
