// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform, Type} from 'class-transformer';
import {ConsensusNodeStateSchema} from './state/consensus-node-state-schema.js';
import {type LedgerPhase} from './ledger-phase.js';
import {Transformations} from '../utils/transformations.js';
import {RelayNodeStateSchema} from './state/relay-node-state-schema.js';
import {MirrorNodeStateSchema} from './state/mirror-node-state-schema.js';
import {HAProxyStateSchema} from './state/haproxy-state-schema.js';
import {EnvoyProxyStateSchema} from './state/envoy-proxy-state-schema.js';
import {ExplorerStateSchema} from './state/explorer-state-schema.js';
import {BlockNodeStateSchema} from './state/block-node-state-schema.js';

@Exclude()
export class DeploymentStateSchema {
  @Expose()
  @Transform(Transformations.LedgerPhase)
  public ledgerPhase: LedgerPhase;

  @Expose()
  @Type(() => ConsensusNodeStateSchema)
  public consensusNodes: ConsensusNodeStateSchema[];

  @Expose()
  @Type(() => BlockNodeStateSchema)
  public blockNodes: BlockNodeStateSchema[];

  @Expose()
  @Type(() => MirrorNodeStateSchema)
  public mirrorNodes: MirrorNodeStateSchema[];

  @Expose()
  @Type(() => RelayNodeStateSchema)
  public relayNodes: RelayNodeStateSchema[];

  @Expose()
  @Type(() => HAProxyStateSchema)
  public haProxies: HAProxyStateSchema[];

  @Expose()
  @Type(() => EnvoyProxyStateSchema)
  public envoyProxies: EnvoyProxyStateSchema[];

  @Expose()
  @Type(() => ExplorerStateSchema)
  public explorers: ExplorerStateSchema[];

  public constructor(
    ledgerPhase?: LedgerPhase,
    consensusNodes?: ConsensusNodeStateSchema[],
    blockNodes?: BlockNodeStateSchema[],
    mirrorNodes?: MirrorNodeStateSchema[],
    relayNodes?: RelayNodeStateSchema[],
    haProxies?: HAProxyStateSchema[],
    envoyProxies?: EnvoyProxyStateSchema[],
    explorers?: ExplorerStateSchema[],
  ) {
    this.ledgerPhase = ledgerPhase;
    this.consensusNodes = consensusNodes || [];
    this.blockNodes = blockNodes || [];
    this.mirrorNodes = mirrorNodes || [];
    this.relayNodes = relayNodes || [];
    this.haProxies = haProxies || [];
    this.envoyProxies = envoyProxies || [];
    this.explorers = explorers || [];
  }
}
