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
    this.consensusNodes = consensusNodes || 0;
    this.blockNodes = blockNodes || 0;
    this.mirrorNodes = mirrorNodes || 0;
    this.relayNodes = relayNodes || 0;
    this.haProxies = haProxies || 0;
    this.envoyProxies = envoyProxies || 0;
    this.explorers = explorers || 0;
  }
}
