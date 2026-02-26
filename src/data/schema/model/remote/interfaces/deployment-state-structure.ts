// SPDX-License-Identifier: Apache-2.0

import {type LedgerPhase} from '../ledger-phase.js';
import {type ConsensusNodeStateSchema} from '../state/consensus-node-state-schema.js';
import {type BlockNodeStateSchema} from '../state/block-node-state-schema.js';
import {type MirrorNodeStateSchema} from '../state/mirror-node-state-schema.js';
import {type RelayNodeStateSchema} from '../state/relay-node-state-schema.js';
import {type HaProxyStateSchema} from '../state/ha-proxy-state-schema.js';
import {type EnvoyProxyStateSchema} from '../state/envoy-proxy-state-schema.js';
import {type ExplorerStateSchema} from '../state/explorer-state-schema.js';
import {type ComponentIdsStructure} from './components-ids-structure.js';

export interface DeploymentStateStructure {
  ledgerPhase: LedgerPhase;
  componentIds: ComponentIdsStructure;
  consensusNodes: ConsensusNodeStateSchema[];
  blockNodes: BlockNodeStateSchema[];
  mirrorNodes: MirrorNodeStateSchema[];
  relayNodes: RelayNodeStateSchema[];
  haProxies: HaProxyStateSchema[];
  envoyProxies: EnvoyProxyStateSchema[];
  explorers: ExplorerStateSchema[];
  tssEnabled: boolean;
  wrapsEnabled: boolean;
}
