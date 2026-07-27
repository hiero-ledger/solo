// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class MissingPodReferenceError extends KubeError {
  public static MISSING_POD_REF: string = 'Pod ref is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause?: Error | unknown, meta: object = {}) {
    super(MissingPodReferenceError.MISSING_POD_REF, cause instanceof Error ? cause : undefined, meta);
  }
}
