// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class MissingContainerNameError extends KubeError {
  public static MISSING_CONTAINER_NAME: string = 'Container Name is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause?: Error | unknown, meta: object = {}) {
    super(MissingContainerNameError.MISSING_CONTAINER_NAME, cause instanceof Error ? cause : undefined, meta);
  }
}
