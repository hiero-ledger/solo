// SPDX-License-Identifier: Apache-2.0

import {Templates} from './templates.js';
import {type PriorityMapping, type ToJSON} from '../types/index.js';
import * as constants from './constants.js';
import {type BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {type ClusterSchema} from '../data/schema/model/common/cluster-schema.js';
import {lt} from 'semver';
import * as versions from '../../version.js';
import {inject} from 'tsyringe-neo';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {ExternalBlockNodeStateSchema} from '../data/schema/model/remote/state/external-block-node-state-schema.js';

type BlockNodeConnectionData =
  | {
      address: string;
      port: number;
      priority: number;
    }
  | {
      address: string;
      streamingPort: number;
      servicePort: number;
      priority: number;
    };

interface BlockNodesJsonStructure {
  nodes: BlockNodeConnectionData[];
  blockItemBatchSize: number;
}

/**
 * Wrapper used to generate `block-nodes.json` file
 * for the consensus node used to configure block node connections.
 */
export class BlockNodesJsonWrapper implements ToJSON {
  private readonly remoteConfig: RemoteConfigRuntimeStateApi;
  private readonly blockNodes: BlockNodeStateSchema[];
  private readonly externalBlockNodes: ExternalBlockNodeStateSchema[];

  public constructor(
    private readonly blockNodeMap: PriorityMapping[],
    private readonly externalBlockNodeMap: PriorityMapping[],
    @inject(InjectTokens.RemoteConfigRuntimeState) remoteConfig?: RemoteConfigRuntimeStateApi,
  ) {
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.blockNodes = this.remoteConfig.configuration.state.blockNodes;
    this.externalBlockNodes = this.remoteConfig.configuration.state.externalBlockNodes;
  }

  public toJSON(): string {
    return JSON.stringify(this.buildBlockNodesJsonStructure());
  }

  private buildBlockNodesJsonStructure(): BlockNodesJsonStructure {
    // Figure out field name for port
    const useLegacyPortName: boolean = lt(
      this.remoteConfig.configuration.versions.consensusNode,
      versions.MINIMUM_HIERO_CONSENSUS_NODE_VERSION_FOR_LEGACY_PORT_NAME_FOR_BLOCK_NODES_JSON_FILE,
    );

    const blockNodeConnectionData: BlockNodeConnectionData[] = [];

    for (const [id, priority] of this.blockNodeMap) {
      const blockNodeComponent: BlockNodeStateSchema = this.blockNodes.find(
        (component): boolean => component.metadata.id === id,
      );

      const cluster: ClusterSchema = this.remoteConfig.configuration.clusters.find(
        (cluster): boolean => cluster.name === blockNodeComponent.metadata.cluster,
      );

      const address: string = Templates.renderSvcFullyQualifiedDomainName(
        Templates.renderBlockNodeName(blockNodeComponent.metadata.id),
        blockNodeComponent.metadata.namespace,
        cluster.dnsBaseDomain,
      );

      // Figure out the block node port
      const useLegacyPort: boolean = lt(
        this.remoteConfig.configuration.versions.blockNodeChart,
        versions.MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_NEW_LIVENESS_CHECK_PORT,
      );

      const port: number = useLegacyPort ? constants.BLOCK_NODE_PORT_LEGACY : constants.BLOCK_NODE_PORT;

      blockNodeConnectionData.push(
        useLegacyPortName ? {address, port, priority} : {address, streamingPort: port, servicePort: port, priority},
      );
    }

    for (const [id, priority] of this.externalBlockNodeMap) {
      const blockNodeComponent: ExternalBlockNodeStateSchema = this.externalBlockNodes.find(
        (component): boolean => component.id === id,
      );

      const address: string = blockNodeComponent.address;
      const port: number = blockNodeComponent.port;

      blockNodeConnectionData.push(
        useLegacyPortName ? {address, port, priority} : {address, streamingPort: port, servicePort: port, priority},
      );
    }

    return {
      nodes: blockNodeConnectionData,
      blockItemBatchSize: constants.BLOCK_ITEM_BATCH_SIZE,
    };
  }
}
