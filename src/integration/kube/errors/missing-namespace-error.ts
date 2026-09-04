// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class MissingNamespaceError extends KubeError {
  public static MISSING_NAMESPACE: string = 'Namespace is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause?: Error, meta?: object) {
    super(MissingNamespaceError.MISSING_NAMESPACE, cause, meta);
  }
}
