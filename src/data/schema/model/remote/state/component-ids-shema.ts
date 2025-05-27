// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';

@Exclude()
export class ComponentIdsShema {
  @Expose()
  public consensusNodes: number;

  @Expose()
  public blockNodes: number;

  @Expose()
  public mirrorNodes: number;

  @Expose()
  public relayNodes: number;

  @Expose()
  public haProxies: number;

  @Expose()
  public envoyProxies: number;

  @Expose()
  public explorers: number;

  public constructor(
    consensusNodes?: number,
    blockNodes?: number,
    mirrorNodes?: number,
    relayNodes?: number,
    haProxies?: number,
    envoyProxies?: number,
    explorers?: number,
  ) {
    this.consensusNodes = consensusNodes || 1;
    this.blockNodes = blockNodes || 1;
    this.mirrorNodes = mirrorNodes || 1;
    this.relayNodes = relayNodes || 1;
    this.haProxies = haProxies || 1;
    this.envoyProxies = envoyProxies || 1;
    this.explorers = explorers || 1;
  }
}
