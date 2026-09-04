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
  messageSizeSoftLimitBytes?: number;
  messageSizeHardLimitBytes?: number;
};

type BlockNodesJson = {
  nodes: BlockNodesJsonNode[];
  blockItemBatchSize?: number;
};

interface MessageSizeOptions {
  tssEnabled?: boolean;
  softLimitOverride?: number;
  hardLimitOverride?: number;
}

// The defaults baked into SoloConfigSchema/TssSchema; used when no deployment-wide override is set.
const DEFAULT_SOFT_LIMIT_BYTES: number = 4_194_304;
const DEFAULT_HARD_LIMIT_BYTES: number = 37_748_736;

function buildSingleNodeJson(options: MessageSizeOptions): BlockNodesJson {
  const remoteConfig: RemoteConfigRuntimeStateApi = {
    configuration: {
      state: {
        blockNodes: [{metadata: {id: 1, cluster: 'kind-solo-cluster', namespace: 'solo'}}],
        externalBlockNodes: [],
        tssEnabled: options.tssEnabled ?? false,
        blockNodeMessageSizeSoftLimitBytes: options.softLimitOverride,
        blockNodeMessageSizeHardLimitBytes: options.hardLimitOverride,
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

  const json: string = new BlockNodesJsonWrapper([[1, 0]], [], remoteConfig, configProvider).toJSON();
  return JSON.parse(json) as BlockNodesJson;
}

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

  it('should omit message-size limits when TSS is disabled, even if overrides are set', (): void => {
    const parsed: BlockNodesJson = buildSingleNodeJson({
      tssEnabled: false,
      softLimitOverride: 8_388_608,
      hardLimitOverride: 33_554_432,
    });

    expect(parsed.nodes[0]).to.not.have.property('messageSizeSoftLimitBytes');
    expect(parsed.nodes[0]).to.not.have.property('messageSizeHardLimitBytes');
  });

  it('should fall back to TSS config defaults when no deployment-wide override is set', (): void => {
    const parsed: BlockNodesJson = buildSingleNodeJson({tssEnabled: true});

    expect(parsed.nodes[0].messageSizeSoftLimitBytes).to.equal(DEFAULT_SOFT_LIMIT_BYTES);
    expect(parsed.nodes[0].messageSizeHardLimitBytes).to.equal(DEFAULT_HARD_LIMIT_BYTES);
  });

  it('should use the deployment-wide override when set', (): void => {
    const parsed: BlockNodesJson = buildSingleNodeJson({
      tssEnabled: true,
      softLimitOverride: 8_388_608,
      hardLimitOverride: 33_554_432,
    });

    expect(parsed.nodes[0].messageSizeSoftLimitBytes).to.equal(8_388_608);
    expect(parsed.nodes[0].messageSizeHardLimitBytes).to.equal(33_554_432);
  });

  it('should override only the limit that is provided and fall back for the other', (): void => {
    const parsed: BlockNodesJson = buildSingleNodeJson({
      tssEnabled: true,
      hardLimitOverride: 33_554_432,
    });

    expect(parsed.nodes[0].messageSizeSoftLimitBytes).to.equal(DEFAULT_SOFT_LIMIT_BYTES);
    expect(parsed.nodes[0].messageSizeHardLimitBytes).to.equal(33_554_432);
  });
});
