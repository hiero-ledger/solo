// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../spi/config-source.js';
import {type ConfigAccessor} from '../spi/config-accessor.js';
import {type Refreshable} from '../spi/refreshable.js';

/**
 * Represents a single application wide multi-layer configuration.
 */
export interface Config extends ConfigAccessor, Refreshable {
  /**
   * All the configuration sources which were used to build this configuration.
   */
  readonly sources: ConfigSource[];

  /**
   * Adds a configuration source to the configuration.
   *
   * This method is not guaranteed to be thread-safe, so it should not be called concurrently with other methods
   * that modify the configuration. Methods which read the configuration may be called concurrently, but may not
   * reflect changes made by this method.
   *
   * This method is typically used to add configuration sources that have been created or loaded dynamically,
   * such as configuration files, environment variables, or other sources of configuration data.
   *
   * The same {@link ConfigSource} instance can only be added once. If the same source is added again, a
   * DuplicateConfigSourceError will be thrown. This is to ensure that each configuration source is unique within
   * the configuration.
   *
   * A {@link ConfigSource} with the same name and ordinal as an existing source will be considered a duplicate,
   * even if it is a different instance.
   *
   * @param source - The configuration source to be added.
   * @throws {DuplicateConfigSourceError} if the configuration source has already been added.
   */
  addSource(source: ConfigSource): void;
}
