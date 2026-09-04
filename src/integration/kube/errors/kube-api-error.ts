// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubeApiError extends KubeError {
  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param message - the error message.
   * @param statusCode - the HTTP status code.
   * @param input - the input that caused the error (if available).
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(message: string, statusCode: number, input?: unknown, cause?: Error, meta?: object) {
    super(message + `, statusCode: ${statusCode}, input: ${input}`, cause, {...meta, statusCode}, statusCode);
  }
}
