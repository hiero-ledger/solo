// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {ComponentStateMetadataSchema} from './component-state-metadata-schema.js';

@Exclude()
export class BaseStateSchema {
  @Expose()
  public metadata: ComponentStateMetadataSchema;

  public constructor(metadata?: ComponentStateMetadataSchema) {
    this.metadata = metadata;
  }
}
