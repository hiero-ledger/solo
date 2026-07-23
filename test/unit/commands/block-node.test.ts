// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {container} from 'tsyringe-neo';
import {BlockNodeCommand} from '../../../src/commands/block-node.js';
import * as constants from '../../../src/core/constants.js';
import {type SemanticVersion} from '../../../src/business/utils/semantic-version.js';
import {ClusterSchema} from '../../../src/data/schema/model/common/cluster-schema.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../test-container.js';
import fs from 'node:fs';
import os from 'node:os';
import {PathEx} from '../../../src/business/utils/path-ex.js';

interface BlockNodeCommandInternal {
  remoteConfig: {
    getConsensusNodes: () => Array<{name: string}>;
    configuration: {
      clusters: ClusterSchema[];
      versions?: {
        consensusNode: SemanticVersion<string> | string;
      };
      state: {
        tssEnabled: boolean;
        blockNodes: {
          metadata: {
            id: number;
            cluster: string;
          };
        }[];
        mirrorNodes?: {
          metadata: {
            id: number;
          };
        }[];
      };
    };
  };
  prepareValuesArgForBlockNode: (configuration: Record<string, unknown>) => Promise<HelmChartValues>;
}

describe('BlockNodeCommand unit tests', (): void => {
  let blockNodeCommand: BlockNodeCommand;
  let testCacheDirectory: string | undefined;

  beforeEach((): void => {
    resetForTest();
    blockNodeCommand = container.resolve(BlockNodeCommand);
  });

  afterEach((): void => {
    if (testCacheDirectory) {
      fs.rmSync(testCacheDirectory, {recursive: true, force: true});
      testCacheDirectory = undefined;
    }
  });

  it('should configure peer block node sources under the chart backfill values path', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [],
      configuration: {
        clusters: [new ClusterSchema('cluster-a', 'solo-ns', 'deployment', 'cluster.local')],
        versions: {
          consensusNode: '0.75.1',
        },
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

  it('should configure the RSA mirror bootstrap source for block-stream consensus versions', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [],
      configuration: {
        clusters: [],
        versions: {
          consensusNode: '0.75.1',
        },
        state: {
          tssEnabled: false,
          blockNodes: [],
          mirrorNodes: [
            {
              metadata: {
                id: 2,
              },
            },
          ],
        },
      },
    };

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: true,
      valuesFile: undefined,
      releaseName: 'block-node-1',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();

    expect(valueArguments).to.include('--set-literal');
    expect(valueArguments).to.include(
      'blockNode.config.ROSTER_BOOTSTRAP_RSA_MIRROR_NODE_BASE_URL=http://mirror-2-restjava:80',
    );
  });

  it('should inject the RSA bootstrap file when cache keys are available', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    testCacheDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-block-node-test-'));
    const keysDirectory: string = PathEx.join(testCacheDirectory, 'keys');
    fs.mkdirSync(keysDirectory, {recursive: true});
    fs.copyFileSync(
      PathEx.joinWithRealPath('test', 'data', 'pem', 'keys', 's-public-node1.pem'),
      PathEx.join(keysDirectory, 's-public-node1.pem'),
    );

    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [
        {
          name: 'node1',
        },
      ],
      configuration: {
        clusters: [],
        versions: {
          consensusNode: '0.75.1',
        },
        state: {
          tssEnabled: false,
          blockNodes: [],
        },
      },
    };

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: true,
      cacheDir: testCacheDirectory,
      valuesFile: undefined,
      releaseName: 'block-node-1',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();
    const valuesFile: string | undefined = valueArguments.find((argument: string): boolean =>
      argument.endsWith('block-node-1-rsa-bootstrap-values.yaml'),
    );

    expect(valuesFile).to.not.equal(undefined);
    if (!valuesFile) {
      throw new Error('RSA bootstrap values file was not generated');
    }
    const rsaBootstrapValues: string = fs.readFileSync(valuesFile, 'utf8');
    expect(rsaBootstrapValues).to.contain('rsa-bootstrap-roster.json');
    expect(rsaBootstrapValues).to.contain('[ ! -s /application-state-pvc/rsa-bootstrap-roster.json ]');
    expect(rsaBootstrapValues).to.contain('RSAPubKey');
    expect(rsaBootstrapValues).to.contain('application-state-storage');
  });

  it('should not configure the RSA mirror bootstrap source before TSS-era consensus versions', async (): Promise<void> => {
    const blockNodeCommandInternal: BlockNodeCommandInternal = blockNodeCommand as unknown as BlockNodeCommandInternal;
    blockNodeCommandInternal.remoteConfig = {
      getConsensusNodes: (): Array<{name: string}> => [],
      configuration: {
        clusters: [],
        versions: {
          consensusNode: '0.73.0',
        },
        state: {
          tssEnabled: false,
          blockNodes: [],
          mirrorNodes: [
            {
              metadata: {
                id: 2,
              },
            },
          ],
        },
      },
    };

    const chartValues: HelmChartValues = await blockNodeCommandInternal.prepareValuesArgForBlockNode({
      blockNodeTssOverlay: true,
      valuesFile: undefined,
      releaseName: 'block-node-1',
      namespace: NamespaceName.of('solo-ns'),
    });

    const valueArguments: string[] = chartValues.toArguments();

    expect(valueArguments).to.not.include(
      'blockNode.config.ROSTER_BOOTSTRAP_RSA_MIRROR_NODE_BASE_URL=http://mirror-2-restjava:80',
    );
  });
});
