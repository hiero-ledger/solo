// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import {container} from 'tsyringe-neo';
import {BlockNodeCommand} from '../../../src/commands/block-node.js';
import * as constants from '../../../src/core/constants.js';
import {ClusterSchema} from '../../../src/data/schema/model/common/cluster-schema.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../test-container.js';

interface BlockNodeCommandInternal {
  remoteConfig: {
    configuration: {
      clusters: ClusterSchema[];
      state: {
        tssEnabled: boolean;
        blockNodes: {
          metadata: {
            id: number;
            cluster: string;
          };
        }[];
      };
    };
  };
  prepareValuesArgForBlockNode: (configuration: Record<string, unknown>) => Promise<HelmChartValues>;
}

describe('BlockNodeCommand unit tests', (): void => {
  let blockNodeCommand: BlockNodeCommand;

  beforeEach((): void => {
    resetForTest();
    blockNodeCommand = container.resolve(BlockNodeCommand);
  });

  it('should configure peer block node sources under the chart backfill values path', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    blockNodeCommandInternal.remoteConfig = {
      configuration: {
        clusters: [new ClusterSchema('cluster-a', 'solo-ns', 'deployment', 'cluster.local')],
        state: {
          tssEnabled: false,
          blockNodes: [
            {
              metadata: {
                id: 1,
                cluster: 'cluster-a',
              },
            },
          ],
        },
      },
    };

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: false,
      valuesFile: undefined,
      releaseName: 'block-node-2',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();

    expect(valueArguments).to.include('blockNode.backfill.sources[0].address=block-node-1.solo-ns.svc.cluster.local');
    expect(valueArguments).to.include(`blockNode.backfill.sources[0].port=${constants.BLOCK_NODE_PORT}`);
    expect(valueArguments).to.include('blockNode.backfill.sources[0].priority=1');
    expect(valueArguments).to.not.include('blockNode.sources[0].address=block-node-1.solo-ns.svc.cluster.local');
  });
});
