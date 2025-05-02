// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {ComponentStateMetadata} from './component-state-metadata.js';

@Exclude()
export class HAProxyState {
  @Expose()
  public metadata: ComponentStateMetadata;

  public constructor(metadata?: ComponentStateMetadata) {
    this.metadata = metadata;
  }
}
