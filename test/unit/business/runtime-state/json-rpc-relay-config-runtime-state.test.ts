// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {UnloadedConfigError} from '../../../../src/business/runtime-state/errors/unloaded-config-error.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {JsonRpcRelayConfigRuntimeState} from '../../../../src/business/runtime-state/config/json-rpc-relay/json-rpc-relay-config-runtime-state.js';
import {type JsonRpcRelayConfig} from '../../../../src/business/runtime-state/config/json-rpc-relay/json-rpc-relay-config.js';

describe('JsonRpcRelayConfigRuntimeState', (): void => {
  let jsonRpcRelayConfigRuntimeState: JsonRpcRelayConfigRuntimeState;

  beforeEach((): void => {
    jsonRpcRelayConfigRuntimeState = new JsonRpcRelayConfigRuntimeState(
      container.resolve(InjectTokens.ObjectMapper),
      container.resolve(InjectTokens.ConfigProvider),
    );
  });

  it('should load the configuration', async (): Promise<void> => {
    await jsonRpcRelayConfigRuntimeState.load();
    expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig).to.be.an('object');
    expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig).to.have.property('helmChart');
    expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig.helmChart).to.be.an('object');
    expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig.helmChart.name).to.equal('hedera-json-rpc-relay');
    expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig.helmChart.repository).to.equal(
      'https://hiero-ledger.github.io/hiero-json-rpc-relay/charts',
    );
    expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig.helmChart.directory).to.equal(undefined);
  });

  it('should throw an error if the configuration is not loaded', (): void => {
    expect((): JsonRpcRelayConfig => jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig).to.throw(
      UnloadedConfigError,
      'JsonRpcRelayConfig is not loaded yet.',
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
      process.env['SOLO_JSON_RPC_RELAY_HELM-CHART_DIRECTORY'] = directory;
      await jsonRpcRelayConfigRuntimeState.load();
      const jsonRpcRelayConfig: JsonRpcRelayConfig = jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig;
      expect(jsonRpcRelayConfig).to.have.property('helmChart');
      expect(jsonRpcRelayConfig.helmChart).to.have.property('directory');
      expect(jsonRpcRelayConfig.helmChart.directory).to.equal(directory);
      expect(jsonRpcRelayConfig.helmChart.repository).to.equal(directory);
    });

    it('should overwrite runtime state with value from environment variable', async (): Promise<void> => {
      await jsonRpcRelayConfigRuntimeState.load();
      expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig).to.have.property('helmChart');
      expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig.helmChart).to.have.property('repository');
      expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig.helmChart.repository).to.equal(
        'https://hiero-ledger.github.io/hiero-json-rpc-relay/charts',
      );

      const overwrittenHelmChartRepository: string = 'oci://ghcr.io/overwritten/charts';
      process.env['SOLO_JSON_RPC_RELAY_HELM-CHART_DIRECTORY'] = overwrittenHelmChartRepository;
      await jsonRpcRelayConfigRuntimeState.load();

      expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig).to.have.property('helmChart');
      expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig.helmChart).to.have.property('repository');
      expect(jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig.helmChart.repository).to.equal(
        overwrittenHelmChartRepository,
      );
    });

    it('should merge multiple configuration sources correctly', async (): Promise<void> => {
      process.env['SOLO_JSON_RPC_RELAY_HELM-CHART_NAME'] = 'merged-deployment';
      process.env['SOLO_JSON_RPC_RELAY_HELM-CHART_REPOSITORY'] = 'oci://ghcr.io/merged/charts';

      await jsonRpcRelayConfigRuntimeState.load();
      const jsonRpcRelayConfig: JsonRpcRelayConfig = jsonRpcRelayConfigRuntimeState.jsonRpcRelayConfig;

      expect(jsonRpcRelayConfig.helmChart).to.be.an('object');
      expect(jsonRpcRelayConfig.helmChart.name).to.equal('merged-deployment');
      expect(jsonRpcRelayConfig.helmChart.repository).to.equal('oci://ghcr.io/merged/charts');
    });
  });
});
