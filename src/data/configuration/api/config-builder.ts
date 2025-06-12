// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../spi/config-source.js';
import {type Config} from './config.js';
import {type Converter} from '../spi/converter.js';
import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';

/**
 * Fluent builder for creating a Config instance.
 */
export interface ConfigBuilder {
  /**
   * Adds the default configuration sources to the configuration.
   *
   * @return The ConfigBuilder instance for method chaining.
   */
  withDefaultSources(): ConfigBuilder;

  /**
   * Adds the default configuration converters to the configuration.
   *
   * @return The ConfigBuilder instance for method chaining.
   */
  withDefaultConverters(): ConfigBuilder;

  /**
   * Adds the specified configuration sources to the configuration.
   *
   * @param sources - The configuration sources to be added.
   * @return The ConfigBuilder instance for method chaining.
   */
  withSources(...sources: ConfigSource[]): ConfigBuilder;

  /**
   * Adds the specified value converters to the configuration.
   *
   * @param cls - The class of the configuration to which the value should be converted.
   * @param priority - The priority of the configuration converter.
   * @param converter - The configuration converter to be added.
   * @return The ConfigBuilder instance for method chaining.
   */
  withConverter<R extends object>(cls: ClassConstructor<R>, priority: number, converter: Converter<R>): ConfigBuilder;

  /**
   * Sets whether to merge source values.  If true, the values from an objects properties if defined will be used to
   * merge into a final instance. If false, the values from the source with the highest ordinal will be used if the
   * object from that source is defined, even it is properties are not defined.
   *
   * @param mergeSourceValues - Whether to merge source values.
   * @return The ConfigBuilder instance for method chaining.
   */
  withMergeSourceValues(mergeSourceValues: boolean): ConfigBuilder;

  /**
   * Builds a {@link Config} instance and registers it with the {@link ConfigProvider}.
   *
   * @return The built configuration instance.
   * @throws ConfigurationError if a configuration has already been registered.
   */
  build(): Config;
}
