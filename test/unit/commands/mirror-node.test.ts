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

interface MirrorNodeMemoryOverrideConfig {
  mirrorNodeVersion: string;
  chartValues: HelmChartValues;
}

interface MirrorNodeCommandInternal {
  addMirrorNodeMemoryOverrides: (
    hasMirrorNodeMemoryImprovements: boolean,
    config: MirrorNodeMemoryOverrideConfig,
  ) => void;
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
});
