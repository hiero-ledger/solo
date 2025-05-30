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
   */
  withDefaultSources(): ConfigBuilder;

  /**
   * Adds the default configuration converters to the configuration.
   */
  withDefaultConverters(): ConfigBuilder;

  /**
   * Adds the specified configuration sources to the configuration.
   *
   * @param sources - The configuration sources to be added.
   */
  withSources(...sources: ConfigSource[]): ConfigBuilder;

  /**
   * Adds the specified value converters to the configuration.
   *
   * @param cls - The class of the configuration to which the value should be converted.
   * @param priority - The priority of the configuration converter.
   * @param converter - The configuration converter to be added.
   */
  withConverter<R extends object>(cls: ClassConstructor<R>, priority: number, converter: Converter<R>): ConfigBuilder;

  /**
   * Sets whether to merge source values.  If true, the values from an objects properties if defined will be used to
   * merge into a final instance. If false, the values from the source with the highest ordinal will be used if the
   * object from that source is defined, even it is properties are not defined.
   *
   * @param mergeSourceValues - Whether to merge source values.
   */
  withMergeSourceValues(mergeSourceValues: boolean): ConfigBuilder;

  /**
   * Builds a {@link Config} instance.
   */
  build(): Config;
}
