// SPDX-License-Identifier: Apache-2.0

import {type ApplicationVersions} from '../../../data/schema/model/common/application-versions.js';
import {
  type ClusterReference,
  type ClusterReferences,
  type Context,
  type DeploymentName,
} from '../../../types/index.js';
import {type DeploymentState} from '../../../data/schema/model/remote/deployment-state.js';
import {type DeploymentHistory} from '../../../data/schema/model/remote/deployment-history.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type ConfigMap} from '../../../integration/kube/resources/config-map/config-map.js';
import {type RemoteConfig} from '../../../data/schema/model/remote/remote-config.js';
import {type ComponentsDataWrapperApi} from '../../../core/config/remote/api/components-data-wrapper-api.js';
import {type AnyObject, type ArgvStruct, type NodeAliases} from '../../../types/aliases.js';
import {type LedgerPhase} from '../../../data/schema/model/remote/ledger-phase.js';
import {type RemoteConfigMetadata} from '../../../data/schema/model/remote/remote-config-metadata.js';
import {type Cluster} from '../../../data/schema/model/common/cluster.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface RemoteConfigRuntimeStateApi {
  currentCluster: ClusterReference;
  components: ComponentsDataWrapperApi;
  schemaVersion: number;
  metadata: Readonly<RemoteConfigMetadata>;
  versions: Readonly<ApplicationVersions>;
  clusters: Readonly<Readonly<Cluster>[]>;
  state: Readonly<DeploymentState>;
  history: Readonly<DeploymentHistory>;

  getClusterRefs(): ClusterReferences;
  getContexts(): Context[];
  getConsensusNodes(): ConsensusNode[];
  deleteComponents(): Promise<void>;

  isLoaded(): boolean;
  load(namespace?: NamespaceName, context?: Context): Promise<void>;
  populateRemoteConfig(configMap: ConfigMap): Promise<void>;
  write(): Promise<void>;
  modify(callback: (remoteConfig: RemoteConfig, components: ComponentsDataWrapperApi) => Promise<void>): Promise<void>;
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
  addCommandToHistory(command: string, remoteConfig: RemoteConfig): void;
  createConfigMap(namespace: NamespaceName, context: Context): Promise<ConfigMap>;
  getConfigMap(namespace?: NamespaceName, context?: Context): Promise<ConfigMap>;
  loadAndValidate(
    argv: {_: string[]} & AnyObject,
    validate?: boolean,
    skipConsensusNodesValidation?: boolean,
  ): Promise<void>;
}
