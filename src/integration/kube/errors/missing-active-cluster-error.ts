// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class MissingActiveClusterError extends KubeError {
  public static MISSING_ACTIVE_CLUSTER: string =
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
