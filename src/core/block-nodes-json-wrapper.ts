// SPDX-License-Identifier: Apache-2.0

import {Templates} from './templates.js';
import {type ToJSON} from '../types/index.js';
import * as constants from './constants.js';
import {type BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {type ClusterSchema} from '../data/schema/model/common/cluster-schema.js';

interface BlockNodeConnectionData {
  address: string;
  port: number;
}

interface BlockNodesJsonStructure {
  nodes: BlockNodeConnectionData[];
  blockItemBatchSize: number;
}

export class BlockNodesJsonWrapper implements ToJSON {
  public constructor(
    private readonly blockNodeComponents: BlockNodeStateSchema[],
    private readonly clusters: Readonly<ClusterSchema[]>,
  ) {}

  public toJSON(): string {
    const blockNodeConnectionData: BlockNodeConnectionData[] = this.blockNodeComponents.map(
      (blockNodeComponent): BlockNodeConnectionData => {
        const cluster: ClusterSchema = this.clusters.find(
          (cluster: ClusterSchema): boolean => cluster.name === blockNodeComponent.metadata.cluster,
        );

        const address: string = Templates.renderSvcFullyQualifiedDomainName(
          constants.BLOCK_NODE_RELEASE_NAME + '-' + blockNodeComponent.metadata.id,
          blockNodeComponent.metadata.namespace,
          cluster.dnsBaseDomain,
        );

        const port: number = constants.BLOCK_NODE_PORT;

        return {address, port};
      },
    );

    const data: BlockNodesJsonStructure = {
      nodes: blockNodeConnectionData,
      blockItemBatchSize: constants.BLOCK_ITEM_BATCH_SIZE,
    };

    return JSON.stringify(data);
  }
}
