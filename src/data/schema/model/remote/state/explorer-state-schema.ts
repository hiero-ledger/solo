// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {BaseStateSchema} from './base-state-schema.js';
import {ComponentStateMetadataSchema} from './component-state-metadata-schema.js';

@Exclude()
export class ExplorerStateSchema extends BaseStateSchema {
  @Expose()
  public version: string;

  public constructor(metadata?: ComponentStateMetadataSchema, version?: string) {
    super(metadata);
    this.version = version;
  }
}
