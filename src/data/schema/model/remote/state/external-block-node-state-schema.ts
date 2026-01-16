// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {type ComponentId} from '../../../../../types/index.js';

@Exclude()
export class ExternalBlockNodeStateSchema {
  @Expose()
  public id: number;

  @Expose()
  public address: string;

  @Expose()
  public port: number;

  @Expose()
  public consensusNodeIds: number[];

  public constructor(id?: ComponentId, address?: string, port?: number, consensusNodeIds?: number[]) {
    this.id = id;
    this.address = address;
    this.port = port;
    this.consensusNodeIds = consensusNodeIds;
  }
}
