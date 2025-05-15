// SPDX-License-Identifier: Apache-2.0

import {
  type ClusterReference,
  type ClusterReferences,
  type Context,
  type DeploymentName,
} from '../../../types/index.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type ConfigMap} from '../../../integration/kube/resources/config-map/config-map.js';
import {type ComponentsDataWrapperApi} from '../../../core/config/remote/api/components-data-wrapper-api.js';
import {type AnyObject, type ArgvStruct, type NodeAliases} from '../../../types/aliases.js';
import {type LedgerPhase} from '../../../data/schema/model/remote/ledger-phase.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';
import {type ComponentFactoryApi} from '../../../core/config/remote/api/component-factory-api.js';
import {type RemoteConfigMetadataSchema} from '../../../data/schema/model/remote/remote-config-metadata-schema.js';
import {type ApplicationVersionsSchema} from '../../../data/schema/model/common/application-versions-schema.js';
import {type ClusterSchema} from '../../../data/schema/model/common/cluster-schema.js';
import {type DeploymentStateSchema} from '../../../data/schema/model/remote/deployment-state-schema.js';
import {type DeploymentHistorySchema} from '../../../data/schema/model/remote/deployment-history-schema.js';
import {type RemoteConfigSchema} from '../../../data/schema/model/remote/remote-config-schema.js';

export interface RemoteConfigRuntimeStateApi {
  currentCluster: ClusterReference;
  components: ComponentsDataWrapperApi;
  schemaVersion: number;
  metadata: Readonly<RemoteConfigMetadataSchema>;
  versions: Readonly<ApplicationVersionsSchema>;
  clusters: Readonly<Readonly<ClusterSchema>[]>;
  state: Readonly<DeploymentStateSchema>;
  history: Readonly<DeploymentHistorySchema>;

  getClusterRefs(): ClusterReferences;
  getContexts(): Context[];
  getConsensusNodes(): ConsensusNode[];
  deleteComponents(): Promise<void>;

  isLoaded(): boolean;
  load(namespace?: NamespaceName, context?: Context): Promise<void>;
  populateRemoteConfig(configMap: ConfigMap): Promise<void>;
  write(): Promise<void>;
  modify(
    callback: (remoteConfig: RemoteConfigSchema, components: ComponentsDataWrapperApi) => Promise<void>,
  ): Promise<void>;
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

  addCommandToHistory(command: string, remoteConfig: RemoteConfigSchema): void;
  createConfigMap(namespace: NamespaceName, context: Context): Promise<ConfigMap>;
  getConfigMap(namespace?: NamespaceName, context?: Context): Promise<ConfigMap>;
  loadAndValidate(
    argv: {_: string[]} & AnyObject,
    validate?: boolean,
    skipConsensusNodesValidation?: boolean,
  ): Promise<void>;
}
