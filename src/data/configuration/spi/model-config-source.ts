// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from './config-source.js';
import {type SchemaDefinition} from '../../schema/migration/api/schema-definition.js';

export interface ModelConfigSource<T> extends ConfigSource {
  /**
   * The schema that defines the structure of the model.
   */
  readonly schema: SchemaDefinition<T>;

  /**
   * The model data that was read from the configuration source.
   */
  readonly modelData: T;
}
