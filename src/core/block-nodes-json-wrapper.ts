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

interface BlockNodeConnectionData {
  address: string;
  port: number;
  priority: number;
}

interface BlockNodesJsonStructure {
  nodes: BlockNodeConnectionData[];
  blockItemBatchSize: number;
}

export class BlockNodesJsonWrapper implements ToJSON {
  private readonly remoteConfig: RemoteConfigRuntimeStateApi;

  public constructor(
    private readonly blockNodeMap: PriorityMapping[],
    private readonly blockNodeComponents: BlockNodeStateSchema[],
    @inject(InjectTokens.RemoteConfigRuntimeState) remoteConfig?: RemoteConfigRuntimeStateApi,
  ) {
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
  }

  public toJSON(): string {
    const blockNodeConnectionData: BlockNodeConnectionData[] = this.blockNodeMap.map(
      ([id, priority]): BlockNodeConnectionData => {
        const blockNodeComponent: BlockNodeStateSchema = this.blockNodeComponents.find(
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

        const useLegacyPort: boolean = lt(
          this.remoteConfig.configuration.versions.blockNodeChart,
          versions.MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_NEW_LIVENESS_CHECK_PORT,
        );

        const port: number = useLegacyPort ? constants.BLOCK_NODE_PORT_LEGACY : constants.BLOCK_NODE_PORT;

        return {address, port, priority};
      },
    );

    const data: BlockNodesJsonStructure = {
      nodes: blockNodeConnectionData,
      blockItemBatchSize: constants.BLOCK_ITEM_BATCH_SIZE,
    };

    return JSON.stringify(data);
  }
}
