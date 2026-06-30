// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {BlockNodeCommand} from '../../../src/commands/block-node.js';
import * as constants from '../../../src/core/constants.js';
import {ClusterSchema} from '../../../src/data/schema/model/common/cluster-schema.js';
import {DeploymentPhase} from '../../../src/data/schema/model/remote/deployment-phase.js';
import {BlockNodeStateSchema} from '../../../src/data/schema/model/remote/state/block-node-state-schema.js';
import {ComponentStateMetadataSchema} from '../../../src/data/schema/model/remote/state/component-state-metadata-schema.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../test-container.js';

interface BlockNodeK8Stub {
  services: () => BlockNodeServicesStub;
  manifests: () => BlockNodeManifestsStub;
}

interface BlockNodeServicesStub {
  read: (namespace: NamespaceName, name: string) => Promise<{spec: {clusterIP: string}}>;
}

interface BlockNodeManifestsStub {
  patchObject: sinon.SinonStub;
}

interface BlockNodeCommandInternal {
  chartManager: {
    isChartInstalled: sinon.SinonStub;
  };
  k8Factory: {
    getK8: (context: string) => BlockNodeK8Stub;
  };
  remoteConfig: {
    getClusterRefs?: () => Record<string, string>;
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
  patchBlockNodePeerHostAliases: (clusterReference: string, patchEmptyAliases: boolean) => Promise<boolean>;
  inferDestroyData: (
    id: number,
    namespace: NamespaceName,
    context: string,
  ) => Promise<{id: number; releaseName: string; isChartInstalled: boolean; isLegacyChartInstalled: boolean}>;
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

  it('should patch block node StatefulSets with peer host aliases', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    const patchObjectStub: sinon.SinonStub = sinon.stub().resolves();

    blockNodeCommandInternal.k8Factory = {
      getK8: (context: string): BlockNodeK8Stub => {
        expect(context).to.equal('kind-cluster-a');
        return {
          services: (): BlockNodeServicesStub => {
            return {
              read: async (namespace: NamespaceName, name: string): Promise<{spec: {clusterIP: string}}> => {
                expect(namespace.name).to.equal('solo-ns');
                return {spec: {clusterIP: name === 'block-node-1' ? '10.96.0.1' : '10.96.0.2'}};
              },
            };
          },
          manifests: (): BlockNodeManifestsStub => {
            return {
              patchObject: patchObjectStub,
            };
          },
        };
      },
    };
    blockNodeCommandInternal.remoteConfig = {
      getClusterRefs: (): Record<string, string> => {
        return {'cluster-a': 'kind-cluster-a'};
      },
      configuration: {
        clusters: [new ClusterSchema('cluster-a', 'solo-ns', 'deployment', 'cluster.local')],
        state: {
          tssEnabled: false,
          blockNodes: [
            new BlockNodeStateSchema(
              new ComponentStateMetadataSchema(1, 'solo-ns', 'cluster-a', DeploymentPhase.DEPLOYED, []),
            ),
            new BlockNodeStateSchema(
              new ComponentStateMetadataSchema(2, 'solo-ns', 'cluster-a', DeploymentPhase.DEPLOYED, []),
            ),
          ],
        },
      },
    };

    const patched: boolean = await blockNodeCommandInternal.patchBlockNodePeerHostAliases('cluster-a', true);

    expect(patched).to.equal(true);
    expect(patchObjectStub).to.have.callCount(2);
    expect(patchObjectStub.firstCall.firstArg).to.deep.equal({
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        namespace: 'solo-ns',
        name: 'block-node-1',
      },
      spec: {
        template: {
          spec: {
            hostAliases: [
              {
                ip: '10.96.0.2',
                hostnames: ['block-node-2', 'block-node-2.solo-ns.svc.cluster.local'],
              },
            ],
          },
        },
      },
    });
  });

  it('should prefer the current block node release when destroying id 1', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;

    blockNodeCommandInternal.chartManager = {
      isChartInstalled: sinon
        .stub()
        .callsFake(async (_namespace: NamespaceName, releaseName: string): Promise<boolean> => {
          return releaseName === 'block-node-1' || releaseName === 'block-node-0';
        }),
    };
    blockNodeCommandInternal.remoteConfig = {
      configuration: {
        clusters: [new ClusterSchema('cluster-a', 'solo-ns', 'deployment', 'cluster.local')],
        state: {
          tssEnabled: false,
          blockNodes: [
            new BlockNodeStateSchema(
              new ComponentStateMetadataSchema(1, 'solo-ns', 'cluster-a', DeploymentPhase.DEPLOYED, []),
            ),
          ],
        },
      },
    };

    const inferredData: {
      id: number;
      releaseName: string;
      isChartInstalled: boolean;
      isLegacyChartInstalled: boolean;
    } = await blockNodeCommandInternal.inferDestroyData(1, NamespaceName.of('solo-ns'), 'kind-cluster-a');

    expect(inferredData).to.deep.equal({
      id: 1,
      releaseName: 'block-node-1',
      isChartInstalled: true,
      isLegacyChartInstalled: false,
    });
    expect(blockNodeCommandInternal.chartManager.isChartInstalled.firstCall.args[1]).to.equal('block-node-1');
  });
});
