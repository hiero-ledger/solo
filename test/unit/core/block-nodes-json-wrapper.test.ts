// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {BlockNodesJsonWrapper} from '../../../src/core/block-nodes-json-wrapper.js';
import {type ConfigProvider} from '../../../src/data/configuration/api/config-provider.js';
import {type RemoteConfigRuntimeStateApi} from '../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {SoloConfigSchema} from '../../../src/data/schema/model/solo/solo-config-schema.js';
import {type PriorityMapping} from '../../../src/types/index.js';

type BlockNodesJsonNode = {
  address: string;
  priority: number;
  streamingPort?: number;
  servicePort?: number;
};

type BlockNodesJson = {
  nodes: BlockNodesJsonNode[];
  blockItemBatchSize?: number;
};

describe('BlockNodesJsonWrapper', (): void => {
  it('should not include blockItemBatchSize in block-nodes.json output', (): void => {
    const blockNodeMap: PriorityMapping[] = [[1, 0]];
    const externalBlockNodeMap: PriorityMapping[] = [];
    const remoteConfig: RemoteConfigRuntimeStateApi = {
      configuration: {
        state: {
          blockNodes: [{metadata: {id: 1, cluster: 'kind-solo-cluster', namespace: 'solo'}}],
          externalBlockNodes: [],
          tssEnabled: false,
        },
        clusters: [{name: 'kind-solo-cluster', dnsBaseDomain: 'cluster.local'}],
        versions: {
          consensusNode: {lessThan: (): boolean => false},
          blockNodeChart: {lessThan: (): boolean => false},
        },
      },
    } as unknown as RemoteConfigRuntimeStateApi;
    const configProvider: ConfigProvider = {
      config: (): {asObject: () => SoloConfigSchema} => ({
        asObject: (): SoloConfigSchema => new SoloConfigSchema(),
      }),
    } as unknown as ConfigProvider;

    const json: string = new BlockNodesJsonWrapper(
      blockNodeMap,
      externalBlockNodeMap,
      remoteConfig,
      configProvider,
    ).toJSON();
    const parsed: BlockNodesJson = JSON.parse(json) as BlockNodesJson;

    expect(parsed).to.not.have.property('blockItemBatchSize');
    expect(parsed.nodes).to.have.length(1);
    expect(parsed.nodes[0]).to.include({
      address: 'block-node-1.solo.svc.cluster.local',
      streamingPort: 40_840,
      servicePort: 40_840,
      priority: 0,
    });
  });
});
