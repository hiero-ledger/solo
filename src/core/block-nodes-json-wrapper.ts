// SPDX-License-Identifier: Apache-2.0

import {Templates} from './templates.js';
import {type ToJSON} from '../types/index.js';
import * as constants from './constants.js';
import {type BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {type ClusterSchema} from '../data/schema/model/common/cluster-schema.js';
import {type ApplicationVersionsSchema} from '../data/schema/model/common/application-versions-schema.js';
import {lt} from 'semver';
import * as versions from '../../version.js';

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
  public constructor(
    private readonly blockNodeComponents: BlockNodeStateSchema[],
    private readonly clusters: Readonly<ClusterSchema[]>,
    private readonly versions: Readonly<ApplicationVersionsSchema>,
  ) {}

  public toJSON(): string {
    const blockNodeConnectionData: BlockNodeConnectionData[] = this.blockNodeComponents.map(
      (blockNodeComponent): BlockNodeConnectionData => {
        const cluster: ClusterSchema = this.clusters.find(
          (cluster: ClusterSchema): boolean => cluster.name === blockNodeComponent.metadata.cluster,
        );

        const address: string = Templates.renderSvcFullyQualifiedDomainName(
          Templates.renderBlockNodeName(blockNodeComponent.metadata.id),
          blockNodeComponent.metadata.namespace,
          cluster.dnsBaseDomain,
        );

        const useLegacyPort: boolean = lt(
          this.versions.blockNodeChart,
          versions.MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_NEW_LIVENESS_CHECK_PORT,
        );

        const port: number = useLegacyPort ? constants.BLOCK_NODE_PORT_LEGACY : constants.BLOCK_NODE_PORT;

        return {address, port, priority: 1};
      },
    );

    const data: BlockNodesJsonStructure = {
      nodes: blockNodeConnectionData,
      blockItemBatchSize: constants.BLOCK_ITEM_BATCH_SIZE,
    };

    return JSON.stringify(data);
  }
}
