// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {ComponentStateMetadata} from './component-state-metadata.js';

@Exclude()
export class BaseState {
  @Expose()
  public metadata: ComponentStateMetadata;

  protected constructor(metadata?: ComponentStateMetadata) {
    this.metadata = metadata;
  }
}
