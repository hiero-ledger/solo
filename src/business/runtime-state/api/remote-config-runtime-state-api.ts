// SPDX-License-Identifier: Apache-2.0

import {
  type ClusterReference,
  type ClusterReferences,
  type Context,
  type DeploymentName,
} from '../../../types/index.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type ConfigMap} from '../../../integration/kube/resources/config-map/config-map.js';
import {type AnyObject, type ArgvStruct, type NodeAliases} from '../../../types/aliases.js';
import {type LedgerPhase} from '../../../data/schema/model/remote/ledger-phase.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';
import {type ComponentFactoryApi} from '../../../core/config/remote/api/component-factory-api.js';
import {type RemoteConfig} from '../config/remote/remote-config.js';

export interface RemoteConfigRuntimeStateApi {
  currentCluster: ClusterReference;
  configuration?: RemoteConfig;

  getClusterRefs(): ClusterReferences;
  getContexts(): Context[];
  getConsensusNodes(): ConsensusNode[];
  deleteComponents(): Promise<void>;

  isLoaded(): boolean;
  load(namespace?: NamespaceName, context?: Context): Promise<void>;
  populateRemoteConfig(configMap: ConfigMap): Promise<void>;
  persist(): Promise<void>;

  create(
    argv: ArgvStruct,
    ledgerPhase: LedgerPhase,
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deployment: DeploymentName,
    clusterReference: ClusterReference,
    context: Context,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ): Promise<void>;

  createFromExisting(
    namespace: NamespaceName,
    clusterReference: ClusterReference,
    deployment: DeploymentName,
    componentFactory: ComponentFactoryApi,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
    existingClusterContext: Context,
    argv: ArgvStruct,
    nodeAliases: NodeAliases,
  ): Promise<void>;

  addCommandToHistory(command: string): void;
  createConfigMap(namespace: NamespaceName, context: Context): Promise<ConfigMap>;
  getConfigMap(namespace?: NamespaceName, context?: Context): Promise<ConfigMap>;
  loadAndValidate(
    argv: {_: string[]} & AnyObject,
    validate?: boolean,
    skipConsensusNodesValidation?: boolean,
  ): Promise<void>;
}
