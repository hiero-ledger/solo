// SPDX-License-Identifier: Apache-2.0

import {type LedgerPhase} from '../ledger-phase.js';
import {type ComponentIdsShema} from '../state/component-ids-shema.js';
import {type ConsensusNodeStateSchema} from '../state/consensus-node-state-schema.js';
import {type BlockNodeStateSchema} from '../state/block-node-state-schema.js';
import {type MirrorNodeStateSchema} from '../state/mirror-node-state-schema.js';
import {type RelayNodeStateSchema} from '../state/relay-node-state-schema.js';
import {type HAProxyStateSchema} from '../state/haproxy-state-schema.js';
import {type EnvoyProxyStateSchema} from '../state/envoy-proxy-state-schema.js';
import {type ExplorerStateSchema} from '../state/explorer-state-schema.js';

export interface DeploymentStateStructure {
  ledgerPhase: LedgerPhase;
  componentIds: ComponentIdsShema;
  consensusNodes: ConsensusNodeStateSchema[];
  blockNodes: BlockNodeStateSchema[];
  mirrorNodes: MirrorNodeStateSchema[];
  relayNodes: RelayNodeStateSchema[];
  haProxies: HAProxyStateSchema[];
  envoyProxies: EnvoyProxyStateSchema[];
  explorers: ExplorerStateSchema[];
}
