// SPDX-License-Identifier: Apache-2.0

import {ConfigurationError} from './configuration-error.js';
import {type ConfigSource} from '../spi/config-source.js';

/**
 * Error indicating that a configuration source has already been registered.
 */
export class DuplicateConfigSourceError extends ConfigurationError {
  /**
   * Creates a new instance of DuplicateConfigurationSourceError.
   *
   * @param source - The duplicate ConfigSource instance.
   * @param cause - The underlying cause of the error, if any.
   * @param meta - Additional metadata associated with the error.
   */
  public constructor(source: ConfigSource, cause?: Error, meta?: object) {
    super(`duplicate config source: ${source.name} (${source.ordinal})`, cause, {
      name: source.name,
      ordinal: source.ordinal,
      prefix: source.prefix,
      ...meta,
    });
  }
}
