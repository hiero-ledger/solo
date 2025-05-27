// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {ExplorerConfigRuntimeState} from '../../../../src/business/runtime-state/config/explorer/explorer-config-runtime-state.js';
import {UnloadedConfigError} from '../../../../src/business/runtime-state/errors/unloaded-config-error.js';
import {type ExplorerConfig} from '../../../../src/business/runtime-state/config/explorer/explorer-config.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';

describe('ExplorerConfigRuntimeState', (): void => {
  let explorerConfigRuntimeState: ExplorerConfigRuntimeState;

  beforeEach((): void => {
    explorerConfigRuntimeState = new ExplorerConfigRuntimeState(
      container.resolve(InjectTokens.ObjectMapper),
      container.resolve(InjectTokens.ConfigProvider),
    );
  });

  it('should load the configuration', async (): Promise<void> => {
    await explorerConfigRuntimeState.load();
    expect(explorerConfigRuntimeState.explorerConfig).to.be.an('object');
    expect(explorerConfigRuntimeState.explorerConfig).to.have.property('helmChart');
    expect(explorerConfigRuntimeState.explorerConfig.helmChart).to.be.an('object');
    expect(explorerConfigRuntimeState.explorerConfig.helmChart.name).to.equal('hiero-explorer');
    expect(explorerConfigRuntimeState.explorerConfig.helmChart.release).to.equal('hiero-explorer');
    expect(explorerConfigRuntimeState.explorerConfig.helmChart.ingressControllerName).to.equal('explorer-haproxy-ingress');
    expect(explorerConfigRuntimeState.explorerConfig.helmChart.repository).to.equal(
      'oci://ghcr.io/hiero-ledger/hiero-mirror-node-explorer/hiero-explorer-chart',
    );
    expect(explorerConfigRuntimeState.explorerConfig.helmChart.directory).to.equal(undefined);
  });

  it('should throw an error if the configuration is not loaded', (): void => {
    expect((): ExplorerConfig => explorerConfigRuntimeState.explorerConfig).to.throw(
      UnloadedConfigError,
      'ExplorerConfig is not loaded yet.',
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
      process.env['SOLO_EXPLORER_HELM-CHART_DIRECTORY'] = directory;
      await explorerConfigRuntimeState.load();
      const explorerConfig: ExplorerConfig = explorerConfigRuntimeState.explorerConfig;
      expect(explorerConfig).to.have.property('helmChart');
      expect(explorerConfig.helmChart).to.have.property('directory');
      expect(explorerConfig.helmChart.directory).to.equal(directory);
      expect(explorerConfig.helmChart.repository).to.equal(directory);
    });

    it('should overwrite runtime state with value from environment variable', async (): Promise<void> => {
      await explorerConfigRuntimeState.load();
      expect(explorerConfigRuntimeState.explorerConfig).to.have.property('helmChart');
      expect(explorerConfigRuntimeState.explorerConfig.helmChart).to.have.property('repository');
      expect(explorerConfigRuntimeState.explorerConfig.helmChart.repository).to.equal(
        'oci://ghcr.io/hiero-ledger/hiero-mirror-node-explorer/hiero-explorer-chart',
      );

      const overwrittenHelmChartRepository: string = 'oci://ghcr.io/overwritten/charts';
      process.env['SOLO_EXPLORER_HELM-CHART_DIRECTORY'] = overwrittenHelmChartRepository;
      await explorerConfigRuntimeState.load();

      expect(explorerConfigRuntimeState.explorerConfig).to.have.property('helmChart');
      expect(explorerConfigRuntimeState.explorerConfig.helmChart).to.have.property('repository');
      expect(explorerConfigRuntimeState.explorerConfig.helmChart.repository).to.equal(
        overwrittenHelmChartRepository,
      );
    });

    it('should merge multiple configuration sources correctly', async (): Promise<void> => {
      process.env['SOLO_EXPLORER_HELM-CHART_NAME'] = 'merged-deployment';
      process.env['SOLO_EXPLORER_HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/charts';

      await explorerConfigRuntimeState.load();
      const explorerConfig: ExplorerConfig = explorerConfigRuntimeState.explorerConfig;

      expect(explorerConfig.helmChart).to.be.an('object');
      expect(explorerConfig.helmChart.name).to.equal('merged-deployment');
      expect(explorerConfig.helmChart.repository).to.equal('oci://ghcr.io/merged/charts');
    });
  });
});
