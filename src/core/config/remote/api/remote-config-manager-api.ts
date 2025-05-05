// SPDX-License-Identifier: Apache-2.0

import {type RemoteConfigDataWrapper} from '../remote-config-data-wrapper.js';
import {type ClusterReference, type ClusterReferences, type Context, type DeploymentName} from '../types.js';
import {type ComponentsDataWrapper} from '../components-data-wrapper.js';
import {type AnyObject, type ArgvStruct, type NodeAliases} from '../../../../types/aliases.js';
import {type DeploymentStates} from '../enumerations/deployment-states.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';
import {type ConsensusNode} from '../../../model/consensus-node.js';
import {type Cluster} from '../../../../data/schema/model/common/cluster.js';

export interface RemoteConfigManagerApi {
  /** @returns the default cluster from kubectl */
  get currentCluster(): ClusterReference;

  /** @returns the components data wrapper cloned */
  get components(): ComponentsDataWrapper;

  /**
   * @returns the remote configuration data's clusters cloned
   */
  get clusters(): Record<ClusterReference, Cluster>;

  /**
   * Modifies the loaded remote configuration data using a provided callback function.
   * The callback operates on the configuration data, which is then saved to the cluster.
   *
   * @param callback - an async function that modifies the remote configuration data.
   * @throws if the configuration is not loaded before modification, will throw a SoloError {@link SoloError}
   */
  modify(callback: (remoteConfig: RemoteConfigDataWrapper) => Promise<void>): Promise<void>;

  /**
   * Creates a new remote configuration in the Kubernetes cluster.
   * Gathers data from the local configuration and constructs a new ConfigMap
   * entry in the cluster with initial command history and metadata.
   */
  create(
    argv: ArgvStruct,
    state: DeploymentStates,
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deployment: DeploymentName,
    clusterReference: ClusterReference,
    context: Context,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ): Promise<void>;

  /**
   * Performs the loading of the remote configuration.
   * Checks if the configuration is already loaded, otherwise loads and adds the command to history.
   *
   * @param argv - arguments containing command input for historical reference.
   * @param validate - whether to validate the remote configuration.
   * @param [skipConsensusNodesValidation] - whether or not to validate the consensusNodes
   */
  loadAndValidate(
    argv: {_: string[]} & AnyObject,
    validate: boolean,
    skipConsensusNodesValidation: boolean,
  ): Promise<void>;

  /**
   * Get the consensus nodes from the remoteConfigManager and use the localConfig to get the context
   * @returns an array of ConsensusNode objects
   */
  getConsensusNodes(): ConsensusNode[];

  /**
   * Gets a list of distinct contexts from the consensus nodes.
   * @returns an array of context strings.
   */
  getContexts(): Context[];

  /**
   * Gets a list of distinct cluster references from the consensus nodes.
   * @returns an object of cluster references.
   */
  getClusterRefs(): ClusterReferences;
}
