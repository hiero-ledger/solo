// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../core/errors/solo-error.js';

/**
 * General purpose error for configuration failures.
 */
export class ConfigurationError extends SoloError {
  /**
   * Creates a new instance of ConfigurationError.
   *
   * @param message - The error message.
   * @param cause - The underlying cause of the error, if any.
   * @param meta - Additional metadata associated with the error.
   */
  public constructor(message: string, cause?: Error, meta?: object) {
    super(message, cause, meta);
  }
}
