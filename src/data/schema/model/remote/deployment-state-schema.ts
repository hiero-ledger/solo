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
import {ComponentIdsShema} from './state/component-ids-shema.js';

@Exclude()
export class DeploymentStateSchema {
  @Expose()
  @Transform(Transformations.LedgerPhase)
  public ledgerPhase: LedgerPhase;

  @Expose()
  @Type((): typeof ComponentIdsShema => ComponentIdsShema)
  public componentIds: ComponentIdsShema;

  @Expose()
  @Type((): typeof ConsensusNodeStateSchema => ConsensusNodeStateSchema)
  public consensusNodes: ConsensusNodeStateSchema[];

  @Expose()
  @Type((): typeof BlockNodeStateSchema => BlockNodeStateSchema)
  public blockNodes: BlockNodeStateSchema[];

  @Expose()
  @Type((): typeof MirrorNodeStateSchema => MirrorNodeStateSchema)
  public mirrorNodes: MirrorNodeStateSchema[];

  @Expose()
  @Type((): typeof RelayNodeStateSchema => RelayNodeStateSchema)
  public relayNodes: RelayNodeStateSchema[];

  @Expose()
  @Type((): typeof HAProxyStateSchema => HAProxyStateSchema)
  public haProxies: HAProxyStateSchema[];

  @Expose()
  @Type((): typeof EnvoyProxyStateSchema => EnvoyProxyStateSchema)
  public envoyProxies: EnvoyProxyStateSchema[];

  @Expose()
  @Type((): typeof ExplorerStateSchema => ExplorerStateSchema)
  public explorers: ExplorerStateSchema[];

  public constructor(
    ledgerPhase?: LedgerPhase,
    componentIds?: ComponentIdsShema,
    consensusNodes?: ConsensusNodeStateSchema[],
    blockNodes?: BlockNodeStateSchema[],
    mirrorNodes?: MirrorNodeStateSchema[],
    relayNodes?: RelayNodeStateSchema[],
    haProxies?: HAProxyStateSchema[],
    envoyProxies?: EnvoyProxyStateSchema[],
    explorers?: ExplorerStateSchema[],
  ) {
    this.ledgerPhase = ledgerPhase;
    this.componentIds = componentIds || new ComponentIdsShema();
    this.consensusNodes = consensusNodes || [];
    this.blockNodes = blockNodes || [];
    this.mirrorNodes = mirrorNodes || [];
    this.relayNodes = relayNodes || [];
    this.haProxies = haProxies || [];
    this.envoyProxies = envoyProxies || [];
    this.explorers = explorers || [];
  }
}
