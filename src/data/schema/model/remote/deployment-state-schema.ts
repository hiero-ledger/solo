// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform, Type} from 'class-transformer';
import {ConsensusNodeStateSchema} from './state/consensus-node-state-schema.js';
import {type LedgerPhase} from './ledger-phase.js';
import {Transformations} from '../utils/transformations.js';
import {RelayNodeStateSchema} from './state/relay-node-state-schema.js';
import {MirrorNodeStateSchema} from './state/mirror-node-state-schema.js';
import {HaProxyStateSchema} from './state/ha-proxy-state-schema.js';
import {EnvoyProxyStateSchema} from './state/envoy-proxy-state-schema.js';
import {ExplorerStateSchema} from './state/explorer-state-schema.js';
import {BlockNodeStateSchema} from './state/block-node-state-schema.js';
import {ComponentIdsSchema} from './state/component-ids-schema.js';
import {DeploymentStateStructure} from './interfaces/deployment-state-structure.js';
import {ExternalBlockNodeStateSchema} from './state/external-block-node-state-schema.js';

@Exclude()
export class DeploymentStateSchema implements DeploymentStateStructure {
  @Expose()
  @Transform(Transformations.LedgerPhase)
  public ledgerPhase: LedgerPhase;

  @Expose()
  @Type((): typeof ComponentIdsSchema => ComponentIdsSchema)
  public componentIds: ComponentIdsSchema;

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
  @Type((): typeof HaProxyStateSchema => HaProxyStateSchema)
  public haProxies: HaProxyStateSchema[];

  @Expose()
  @Type((): typeof EnvoyProxyStateSchema => EnvoyProxyStateSchema)
  public envoyProxies: EnvoyProxyStateSchema[];

  @Expose()
  @Type((): typeof ExplorerStateSchema => ExplorerStateSchema)
  public explorers: ExplorerStateSchema[];

  @Expose()
  @Type((): typeof ExternalBlockNodeStateSchema => ExternalBlockNodeStateSchema)
  public externalBlockNodes: ExternalBlockNodeStateSchema[];

  public constructor(
    ledgerPhase?: LedgerPhase,
    componentIds?: ComponentIdsSchema,
    consensusNodes?: ConsensusNodeStateSchema[],
    blockNodes?: BlockNodeStateSchema[],
    mirrorNodes?: MirrorNodeStateSchema[],
    relayNodes?: RelayNodeStateSchema[],
    haProxies?: HaProxyStateSchema[],
    envoyProxies?: EnvoyProxyStateSchema[],
    explorers?: ExplorerStateSchema[],
    externalBlockNodes?: ExternalBlockNodeStateSchema[],
  ) {
    this.ledgerPhase = ledgerPhase;
    this.componentIds = componentIds || new ComponentIdsSchema();
    this.consensusNodes = consensusNodes || [];
    this.blockNodes = blockNodes || [];
    this.mirrorNodes = mirrorNodes || [];
    this.relayNodes = relayNodes || [];
    this.haProxies = haProxies || [];
    this.envoyProxies = envoyProxies || [];
    this.explorers = explorers || [];
    this.externalBlockNodes = externalBlockNodes || [];
  }
}
