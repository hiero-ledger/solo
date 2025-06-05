// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {BlockNodeConfigRuntimeState} from '../../../../src/business/runtime-state/config/block-node/block-node-config-runtime-state.js';
import {UnloadedConfigError} from '../../../../src/business/runtime-state/errors/unloaded-config-error.js';
import {type BlockNodeConfig} from '../../../../src/business/runtime-state/config/block-node/block-node-config.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';

describe('BlockNodeConfigRuntimeState', (): void => {
  let blockNodeConfigRuntimeState: BlockNodeConfigRuntimeState;

  beforeEach((): void => {
    blockNodeConfigRuntimeState = new BlockNodeConfigRuntimeState(
      container.resolve(InjectTokens.ObjectMapper),
      container.resolve(InjectTokens.ConfigProvider),
    );
  });

  it('should load the configuration', async (): Promise<void> => {
    await blockNodeConfigRuntimeState.load();
    expect(blockNodeConfigRuntimeState.blockNodeConfig).to.be.an('object');
    expect(blockNodeConfigRuntimeState.blockNodeConfig).to.have.property('helmChart');
    expect(blockNodeConfigRuntimeState.blockNodeConfig.helmChart).to.be.an('object');
    expect(blockNodeConfigRuntimeState.blockNodeConfig.helmChart.name).to.equal('block-node-helm-chart');
    expect(blockNodeConfigRuntimeState.blockNodeConfig.helmChart.release).to.equal('block-node');
    expect(blockNodeConfigRuntimeState.blockNodeConfig.helmChart.containerName).to.equal('block-node-helm-chart');
    expect(blockNodeConfigRuntimeState.blockNodeConfig.helmChart.repository).to.equal(
      'oci://ghcr.io/hiero-ledger/hiero-block-node',
    );
    expect(blockNodeConfigRuntimeState.blockNodeConfig.helmChart.directory).to.equal(undefined);
  });

  it('should throw an error if the configuration is not loaded', (): void => {
    expect((): BlockNodeConfig => blockNodeConfigRuntimeState.blockNodeConfig).to.throw(
      UnloadedConfigError,
      'BlockNodeConfig is not loaded yet.',
    );
  });

  describe('EnvironmentRuntimeState', (): void => {
    let initialEnvironment: any;
    beforeEach((): void => {
      // create a clone to avoid mutation
      initialEnvironment = Object.assign({}, process.env);
    });

    afterEach((): void => {
      // Reset the environment variables to their initial state
      process.env = initialEnvironment;
    });

    it('should load environment variables into solo state', async (): Promise<void> => {
      const directory: string = '../solo-charts/charts';
      process.env['SOLO_BLOCK_NODE_HELM-CHART_DIRECTORY'] = directory;
      await blockNodeConfigRuntimeState.load();
      const blockNodeConfig: BlockNodeConfig = blockNodeConfigRuntimeState.blockNodeConfig;
      expect(blockNodeConfig).to.have.property('helmChart');
      expect(blockNodeConfig.helmChart).to.have.property('directory');
      expect(blockNodeConfig.helmChart.directory).to.equal(directory);
      expect(blockNodeConfig.helmChart.repository).to.equal(directory);
    });

    it('should overwrite runtime state with value from environment variable', async (): Promise<void> => {
      await blockNodeConfigRuntimeState.load();
      expect(blockNodeConfigRuntimeState.blockNodeConfig).to.have.property('helmChart');
      expect(blockNodeConfigRuntimeState.blockNodeConfig.helmChart).to.have.property('repository');
      expect(blockNodeConfigRuntimeState.blockNodeConfig.helmChart.repository).to.equal(
        'oci://ghcr.io/hiero-ledger/hiero-block-node',
      );

      const overwrittenHelmChartRepository: string = 'oci://ghcr.io/overwritten/charts';
      process.env['SOLO_BLOCK_NODE_HELM-CHART_DIRECTORY'] = overwrittenHelmChartRepository;
      await blockNodeConfigRuntimeState.load();

      expect(blockNodeConfigRuntimeState.blockNodeConfig).to.have.property('helmChart');
      expect(blockNodeConfigRuntimeState.blockNodeConfig.helmChart).to.have.property('repository');
      expect(blockNodeConfigRuntimeState.blockNodeConfig.helmChart.repository).to.equal(overwrittenHelmChartRepository);
    });

    it('should merge multiple configuration sources correctly', async (): Promise<void> => {
      process.env['SOLO_BLOCK_NODE_HELM-CHART_NAME'] = 'merged-deployment';
      process.env['SOLO_BLOCK_NODE_HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/charts';

      await blockNodeConfigRuntimeState.load();
      const blockNodeConfig: BlockNodeConfig = blockNodeConfigRuntimeState.blockNodeConfig;

      expect(blockNodeConfig.helmChart).to.be.an('object');
      expect(blockNodeConfig.helmChart.name).to.equal('merged-deployment');
      expect(blockNodeConfig.helmChart.repository).to.equal('oci://ghcr.io/merged/charts');
    });
  });
});
