// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {MirrorNodeCommand} from '../../../src/commands/mirror-node.js';
import * as constants from '../../../src/core/constants.js';
import * as versions from '../../../version.js';
import {resetForTest} from '../../test-container.js';
import {HelmChartValues} from '../../../src/integration/helm/model/values.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'yaml';

interface MirrorNodeMemoryOverrideConfig {
  mirrorNodeVersion: string;
  chartValues: HelmChartValues;
  componentImage?: string;
}

interface MirrorNodeCommandInternal {
  addMirrorNodeMemoryOverrides: (
    hasMirrorNodeMemoryImprovements: boolean,
    config: MirrorNodeMemoryOverrideConfig,
  ) => void;
  prepareBlockNodeIntegrationValues: (config: {
    cacheDir: string;
    clusterReference: string;
    forceBlockNodeIntegration?: boolean;
    mirrorNodeVersion: string;
  }) => HelmChartValues;
}

describe('MirrorNodeCommand unit tests', (): void => {
  let mirrorNodeCommand: MirrorNodeCommand;

  beforeEach((): void => {
    resetForTest();
    mirrorNodeCommand = container.resolve(MirrorNodeCommand);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should keep the legacy web3 image override on arm64 for versions below mirror node 0.155.0', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const config: MirrorNodeMemoryOverrideConfig = {
      mirrorNodeVersion: '0.100.0',
      chartValues: new HelmChartValues(),
    };

    sinon.stub(process, 'arch').value('arm64');

    mirrorNodeCommandInternal.addMirrorNodeMemoryOverrides(true, config);
    const valuesArguments: string[] = config.chartValues.toArguments();

    expect(valuesArguments).to.include(`web3.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`);
    expect(valuesArguments).to.include(`web3.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}web3`);
    expect(valuesArguments).to.include(`web3.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_WEB3}`);
  });

  it('should not override the web3 image on arm64 for mirror node 0.155.0 and above', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const config: MirrorNodeMemoryOverrideConfig = {
      mirrorNodeVersion: versions.MINIMUM_MIRROR_NODE_VERSION_FOR_ARM64_WEB3_NATIVE_IMAGE,
      chartValues: new HelmChartValues(),
    };

    sinon.stub(process, 'arch').value('arm64');

    mirrorNodeCommandInternal.addMirrorNodeMemoryOverrides(true, config);

    const valuesArguments: string[] = config.chartValues.toArguments();

    expect(valuesArguments).to.not.include(`web3.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`);
    expect(valuesArguments).to.not.include(`web3.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}web3`);
    expect(valuesArguments).to.not.include(`web3.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_WEB3}`);
  });

  it('should not override the web3 image on amd64 even for versions below mirror node 0.155.0', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const config: MirrorNodeMemoryOverrideConfig = {
      mirrorNodeVersion: '0.100.0',
      chartValues: new HelmChartValues(),
    };

    sinon.stub(process, 'arch').value('x64');

    mirrorNodeCommandInternal.addMirrorNodeMemoryOverrides(true, config);

    const valuesArguments: string[] = config.chartValues.toArguments();

    expect(valuesArguments).to.not.include(`web3.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`);
    expect(valuesArguments).to.not.include(`web3.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}web3`);
    expect(valuesArguments).to.not.include(`web3.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_WEB3}`);
  });

  it('should not override module image registry/repository when componentImage is provided for legacy versions', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const config: MirrorNodeMemoryOverrideConfig = {
      mirrorNodeVersion: '0.100.0',
      chartValues: new HelmChartValues(),
      componentImage: 'docker.io/library/custom-mirror:dev',
    };

    mirrorNodeCommandInternal.addMirrorNodeMemoryOverrides(false, config);

    const valuesArguments: string[] = config.chartValues.toArguments();

    expect(
      valuesArguments.some((argument: string): boolean =>
        argument.includes(`.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`),
      ),
    ).to.equal(false);
    expect(
      valuesArguments.some((argument: string): boolean =>
        argument.includes(`.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}`),
      ),
    ).to.equal(false);
    expect(valuesArguments).to.include(`grpc.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_GRPC}`);
  });

  it('should not override arm64 web3 image registry/repository when componentImage is provided', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const config: MirrorNodeMemoryOverrideConfig = {
      mirrorNodeVersion: '0.100.0',
      chartValues: new HelmChartValues(),
      componentImage: 'docker.io/library/custom-mirror:dev',
    };

    sinon.stub(process, 'arch').value('arm64');

    mirrorNodeCommandInternal.addMirrorNodeMemoryOverrides(true, config);

    const valuesArguments: string[] = config.chartValues.toArguments();

    expect(valuesArguments).to.not.include(`web3.image.registry=${constants.MIRROR_NODE_OLD_IMAGE_REGISTRY}`);
    expect(valuesArguments).to.not.include(`web3.image.repository=${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}web3`);
    expect(valuesArguments).to.include(`web3.resources.limits.memory=${constants.MIRROR_NODE_OLD_MEMORY_WEB3}`);
  });

  it('should disable record and balance downloaders when block node integration is enabled', (): void => {
    const mirrorNodeCommandInternal: MirrorNodeCommandInternal =
      mirrorNodeCommand as unknown as MirrorNodeCommandInternal;
    const cacheDir: string = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-bn-values-'));

    try {
      (mirrorNodeCommand as any).remoteConfig._remoteConfig = {
        clusters: [{name: 'kind-a', dnsBaseDomain: 'cluster.local'}],
        components: {
          state: {
            blockNodes: [{metadata: {id: 1, cluster: 'kind-a', namespace: 'solo'}}],
          },
        },
        versions: {
          consensusNode: {
            greaterThanOrEqual: (): boolean => true,
          },
          blockNodeChart: {
            greaterThanOrEqual: (): boolean => true,
          },
        },
      };
      (mirrorNodeCommand as any).remoteConfig.phase = 'loaded';

      const chartValues: HelmChartValues = mirrorNodeCommandInternal.prepareBlockNodeIntegrationValues({
        cacheDir,
        clusterReference: 'kind-a',
        mirrorNodeVersion: versions.MINIMUM_MIRROR_NODE_CHART_VERSION_FOR_MIRROR_NODE_INTEGRATION,
      });

      const valuesArguments: string[] = chartValues.toArguments();
      const fileArgumentIndex: number = valuesArguments.indexOf('--values');
      expect(fileArgumentIndex, 'expected block-node integration values file').to.be.greaterThan(-1);

      const valuesFilePath: string = valuesArguments[fileArgumentIndex + 1];
      const values = yaml.parse(fs.readFileSync(valuesFilePath, 'utf8')) as any;

      expect(values.importer.env.SPRING_PROFILES_ACTIVE).to.equal(constants.SPRING_PROFILES_ACTIVE);
      expect(values.importer.env.HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_HOST).to.equal(
        'block-node-1.solo.svc.cluster.local',
      );
      expect(values.importer.config.hiero.mirror.importer.downloader.record.enabled).to.equal(false);
      expect(values.importer.config.hiero.mirror.importer.downloader.balance.enabled).to.equal(false);
    } finally {
      fs.rmSync(cacheDir, {recursive: true, force: true});
    }
  });
});
