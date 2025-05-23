// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {MirrorNodeConfigRuntimeState} from '../../../../src/business/runtime-state/config/mirror-node/mirror-node-config-runtime-state.js';
import {UnloadedConfigError} from '../../../../src/business/runtime-state/errors/unloaded-config-error.js';
import {type MirrorNodeConfig} from '../../../../src/business/runtime-state/config/mirror-node/mirror-node-config.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';

describe('MirrorNodeConfigRuntimeState', (): void => {
  let mirrorNodeConfigRuntimeState: MirrorNodeConfigRuntimeState;

  beforeEach((): void => {
    mirrorNodeConfigRuntimeState = new MirrorNodeConfigRuntimeState(
      container.resolve(InjectTokens.ObjectMapper),
      container.resolve(InjectTokens.ConfigProvider),
    );
  });

  it('should load the configuration', async (): Promise<void> => {
    await mirrorNodeConfigRuntimeState.load();
    expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig).to.be.an('object');
    expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig).to.have.property('helmChart');
    expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig.helmChart).to.be.an('object');
    expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig.helmChart.name).to.equal('hedera-mirror');
    expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig.helmChart.repository).to.equal(
      'https://hashgraph.github.io/hedera-mirror-node/charts',
    );
    expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig.helmChart.directory).to.equal(undefined);
  });

  it('should throw an error if the configuration is not loaded', (): void => {
    expect((): MirrorNodeConfig => mirrorNodeConfigRuntimeState.mirrorNodeConfig).to.throw(
      UnloadedConfigError,
      'MirrorNodeConfig is not loaded yet.',
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
      process.env['SOLO_MIRROR_NODE_HELM-CHART_DIRECTORY'] = directory;
      await mirrorNodeConfigRuntimeState.load();
      const mirrorNodeConfig: MirrorNodeConfig = mirrorNodeConfigRuntimeState.mirrorNodeConfig;
      expect(mirrorNodeConfig).to.have.property('helmChart');
      expect(mirrorNodeConfig.helmChart).to.have.property('directory');
      expect(mirrorNodeConfig.helmChart.directory).to.equal(directory);
      expect(mirrorNodeConfig.helmChart.repository).to.equal(directory);
    });

    it('should overwrite runtime state with value from environment variable', async (): Promise<void> => {
      await mirrorNodeConfigRuntimeState.load();
      expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig).to.have.property('helmChart');
      expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig.helmChart).to.have.property('repository');
      expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig.helmChart.repository).to.equal(
        'https://hashgraph.github.io/hedera-mirror-node/charts',
      );

      const overwrittenHelmChartRepository: string = 'oci://ghcr.io/overwritten/charts';
      process.env['SOLO_MIRROR_NODE_HELM-CHART_DIRECTORY'] = overwrittenHelmChartRepository;
      await mirrorNodeConfigRuntimeState.load();

      expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig).to.have.property('helmChart');
      expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig.helmChart).to.have.property('repository');
      expect(mirrorNodeConfigRuntimeState.mirrorNodeConfig.helmChart.repository).to.equal(
        overwrittenHelmChartRepository,
      );
    });

    it('should merge multiple configuration sources correctly', async (): Promise<void> => {
      process.env['SOLO_MIRROR_NODE_HELM-CHART_NAME'] = 'merged-deployment';
      process.env['SOLO_MIRROR_NODE_HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/charts';

      await mirrorNodeConfigRuntimeState.load();
      const mirrorNodeConfig: MirrorNodeConfig = mirrorNodeConfigRuntimeState.mirrorNodeConfig;

      expect(mirrorNodeConfig.helmChart).to.be.an('object');
      expect(mirrorNodeConfig.helmChart.name).to.equal('merged-deployment');
      expect(mirrorNodeConfig.helmChart.repository).to.equal('oci://ghcr.io/merged/charts');
    });
  });
});
