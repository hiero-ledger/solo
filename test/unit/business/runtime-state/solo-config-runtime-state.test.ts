// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {SoloConfigRuntimeState} from '../../../../src/business/runtime-state/config/solo/solo-config-runtime-state.js';
import {UnloadedConfigError} from '../../../../src/business/runtime-state/errors/unloaded-config-error.js';
import {type SoloConfig} from '../../../../src/business/runtime-state/config/solo/solo-config.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';

describe('SoloConfigRuntimeState', (): void => {
  let soloConfigRuntimeState: SoloConfigRuntimeState;

  beforeEach((): void => {
    soloConfigRuntimeState = new SoloConfigRuntimeState(
      container.resolve(InjectTokens.ObjectMapper),
      container.resolve(InjectTokens.ConfigProvider),
    );
  });

  it('should load the configuration', async (): Promise<void> => {
    await soloConfigRuntimeState.load();
    expect(soloConfigRuntimeState.soloConfig).to.be.an('object');
    expect(soloConfigRuntimeState.soloConfig).to.have.property('helmChart');
    expect(soloConfigRuntimeState.soloConfig.helmChart).to.be.an('object');
    expect(soloConfigRuntimeState.soloConfig.helmChart.name).to.equal('solo-deployment');
    expect(soloConfigRuntimeState.soloConfig.helmChart.repository).to.equal('oci://ghcr.io/hashgraph/solo-charts');
    expect(soloConfigRuntimeState.soloConfig.helmChart.directory).to.equal(undefined);
  });

  it('should throw an error if the configuration is not loaded', (): void => {
    expect((): SoloConfig => soloConfigRuntimeState.soloConfig).to.throw(
      UnloadedConfigError,
      'SoloConfig is not loaded yet.',
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
      process.env['SOLO_HELM-CHART_DIRECTORY'] = directory;
      await soloConfigRuntimeState.load();
      const soloConfig: SoloConfig = soloConfigRuntimeState.soloConfig;
      expect(soloConfig).to.have.property('helmChart');
      expect(soloConfig.helmChart).to.have.property('directory');
      expect(soloConfig.helmChart.directory).to.equal(directory);
      expect(soloConfig.helmChart.repository).to.equal(directory);
    });

    it('should overwrite runtime state with value from environment variable', async (): Promise<void> => {
      await soloConfigRuntimeState.load();
      expect(soloConfigRuntimeState.soloConfig).to.have.property('helmChart');
      expect(soloConfigRuntimeState.soloConfig.helmChart).to.have.property('repository');
      expect(soloConfigRuntimeState.soloConfig.helmChart.repository).to.equal('oci://ghcr.io/hashgraph/solo-charts');

      const overwrittenHelmChartRepository: string = 'oci://ghcr.io/overwritten/charts';
      process.env['SOLO_HELM-CHART_DIRECTORY'] = overwrittenHelmChartRepository;
      await soloConfigRuntimeState.load();

      expect(soloConfigRuntimeState.soloConfig).to.have.property('helmChart');
      expect(soloConfigRuntimeState.soloConfig.helmChart).to.have.property('repository');
      expect(soloConfigRuntimeState.soloConfig.helmChart.repository).to.equal(overwrittenHelmChartRepository);
    });

    it('should merge multiple configuration sources correctly', async (): Promise<void> => {
      process.env['SOLO_HELM-CHART_NAME'] = 'merged-deployment';
      process.env['SOLO_HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/charts';

      await soloConfigRuntimeState.load();
      const soloConfig: SoloConfig = soloConfigRuntimeState.soloConfig;

      expect(soloConfig.helmChart).to.be.an('object');
      expect(soloConfig.helmChart.name).to.equal('merged-deployment');
      expect(soloConfig.helmChart.repository).to.equal('oci://ghcr.io/merged/charts');
    });

    it('should overwrite nodes in multiple config trees', async (): Promise<void> => {
      process.env['SOLO_HELM-CHART_NAME'] = 'merged-helm-chart-deployment';
      process.env['SOLO_HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/helm/charts';
      process.env['SOLO_CLUSTER-SETUP-HELM-CHART_NAME'] = 'merged-cluster-setup-helm-chart-name';
      process.env['SOLO_CLUSTER-SETUP-HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/cluster/setup/helm/charts';

      await soloConfigRuntimeState.load();
      const soloConfig: SoloConfig = soloConfigRuntimeState.soloConfig;

      expect(soloConfig.helmChart).to.be.an('object');
      expect(soloConfig.helmChart.name).to.equal('merged-helm-chart-deployment');
      expect(soloConfig.helmChart.repository).to.equal('oci://ghcr.io/merged/helm/charts');

      expect(soloConfig.clusterSetupHelmChart).to.be.an('object');
      expect(soloConfig.clusterSetupHelmChart.name).to.equal('merged-cluster-setup-helm-chart-name');
      expect(soloConfig.clusterSetupHelmChart.repository).to.equal('oci://ghcr.io/merged/cluster/setup/helm/charts');
    });
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
      process.env['SOLO_HELM-CHART_DIRECTORY'] = directory;
      await soloConfigRuntimeState.load();
      const soloConfig: SoloConfig = soloConfigRuntimeState.soloConfig;
      expect(soloConfig).to.have.property('helmChart');
      expect(soloConfig.helmChart).to.have.property('directory');
      expect(soloConfig.helmChart.directory).to.equal(directory);
      expect(soloConfig.helmChart.repository).to.equal(directory);
    });

    it('should overwrite runtime state with value from environment variable', async (): Promise<void> => {
      await soloConfigRuntimeState.load();
      expect(soloConfigRuntimeState.soloConfig).to.have.property('helmChart');
      expect(soloConfigRuntimeState.soloConfig.helmChart).to.have.property('repository');
      expect(soloConfigRuntimeState.soloConfig.helmChart.repository).to.equal('oci://ghcr.io/hashgraph/solo-charts');

      const overwrittenHelmChartRepository: string = 'oci://ghcr.io/overwritten/charts';
      process.env['SOLO_HELM-CHART_DIRECTORY'] = overwrittenHelmChartRepository;
      await soloConfigRuntimeState.load();

      expect(soloConfigRuntimeState.soloConfig).to.have.property('helmChart');
      expect(soloConfigRuntimeState.soloConfig.helmChart).to.have.property('repository');
      expect(soloConfigRuntimeState.soloConfig.helmChart.repository).to.equal(overwrittenHelmChartRepository);
    });

    it('should merge multiple configuration sources correctly', async (): Promise<void> => {
      process.env['SOLO_HELM-CHART_NAME'] = 'merged-deployment';
      process.env['SOLO_HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/charts';

      await soloConfigRuntimeState.load();
      const soloConfig: SoloConfig = soloConfigRuntimeState.soloConfig;

      expect(soloConfig.helmChart).to.be.an('object');
      expect(soloConfig.helmChart.name).to.equal('merged-deployment');
      expect(soloConfig.helmChart.repository).to.equal('oci://ghcr.io/merged/charts');
    });

    it('should overwrite nodes in multiple config trees', async (): Promise<void> => {
      process.env['SOLO_HELM-CHART_NAME'] = 'merged-helm-chart-deployment';
      process.env['SOLO_HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/helm/charts';
      process.env['SOLO_CLUSTER-SETUP-HELM-CHART_NAME'] = 'merged-cluster-setup-helm-chart-name';
      process.env['SOLO_CLUSTER-SETUP-HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/cluster/setup/helm/charts';

      await soloConfigRuntimeState.load();
      const soloConfig: SoloConfig = soloConfigRuntimeState.soloConfig;

      expect(soloConfig.helmChart).to.be.an('object');
      expect(soloConfig.helmChart.name).to.equal('merged-helm-chart-deployment');
      expect(soloConfig.helmChart.repository).to.equal('oci://ghcr.io/merged/helm/charts');

      expect(soloConfig.clusterSetupHelmChart).to.be.an('object');
      expect(soloConfig.clusterSetupHelmChart.name).to.equal('merged-cluster-setup-helm-chart-name');
      expect(soloConfig.clusterSetupHelmChart.repository).to.equal('oci://ghcr.io/merged/cluster/setup/helm/charts');
    });
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
      process.env['SOLO_HELM-CHART_DIRECTORY'] = directory;
      await soloConfigRuntimeState.load();
      const soloConfig: SoloConfig = soloConfigRuntimeState.soloConfig;
      expect(soloConfig).to.have.property('helmChart');
      expect(soloConfig.helmChart).to.have.property('directory');
      expect(soloConfig.helmChart.directory).to.equal(directory);
      expect(soloConfig.helmChart.repository).to.equal(directory);
    });

    it('should overwrite runtime state with value from environment variable', async (): Promise<void> => {
      await soloConfigRuntimeState.load();
      expect(soloConfigRuntimeState.soloConfig).to.have.property('helmChart');
      expect(soloConfigRuntimeState.soloConfig.helmChart).to.have.property('repository');
      expect(soloConfigRuntimeState.soloConfig.helmChart.repository).to.equal('oci://ghcr.io/hashgraph/solo-charts');

      const overwrittenHelmChartRepository: string = 'oci://ghcr.io/overwritten/charts';
      process.env['SOLO_HELM-CHART_DIRECTORY'] = overwrittenHelmChartRepository;
      await soloConfigRuntimeState.load();

      expect(soloConfigRuntimeState.soloConfig).to.have.property('helmChart');
      expect(soloConfigRuntimeState.soloConfig.helmChart).to.have.property('repository');
      expect(soloConfigRuntimeState.soloConfig.helmChart.repository).to.equal(overwrittenHelmChartRepository);
    });

    it('should merge multiple configuration sources correctly', async (): Promise<void> => {
      process.env['SOLO_HELM-CHART_NAME'] = 'merged-deployment';
      process.env['SOLO_HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/charts';

      await soloConfigRuntimeState.load();
      const soloConfig: SoloConfig = soloConfigRuntimeState.soloConfig;

      expect(soloConfig.helmChart).to.be.an('object');
      expect(soloConfig.helmChart.name).to.equal('merged-deployment');
      expect(soloConfig.helmChart.repository).to.equal('oci://ghcr.io/merged/charts');
    });

    it('should overwrite nodes in multiple config trees', async (): Promise<void> => {
      process.env['SOLO_HELM-CHART_NAME'] = 'merged-helm-chart-deployment';
      process.env['SOLO_HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/helm/charts';
      process.env['SOLO_CLUSTER-SETUP-HELM-CHART_NAME'] = 'merged-cluster-setup-helm-chart-name';
      process.env['SOLO_CLUSTER-SETUP-HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/cluster/setup/helm/charts';

      await soloConfigRuntimeState.load();
      const soloConfig: SoloConfig = soloConfigRuntimeState.soloConfig;

      expect(soloConfig.helmChart).to.be.an('object');
      expect(soloConfig.helmChart.name).to.equal('merged-helm-chart-deployment');
      expect(soloConfig.helmChart.repository).to.equal('oci://ghcr.io/merged/helm/charts');

      expect(soloConfig.clusterSetupHelmChart).to.be.an('object');
      expect(soloConfig.clusterSetupHelmChart.name).to.equal('merged-cluster-setup-helm-chart-name');
      expect(soloConfig.clusterSetupHelmChart.repository).to.equal('oci://ghcr.io/merged/cluster/setup/helm/charts');
    });
  });
});
