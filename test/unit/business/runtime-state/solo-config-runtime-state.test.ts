// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {SoloConfigRuntimeState} from '../../../../src/business/runtime-state/config/solo/solo-config-runtime-state.js';
import {UnloadedConfigError} from '../../../../src/business/runtime-state/errors/unloaded-config-error.js';
import {type SoloConfig} from '../../../../src/business/runtime-state/config/solo/solo-config.js';

describe('SoloConfigRuntimeState', (): void => {
  let soloConfigRuntimeState: SoloConfigRuntimeState;

  beforeEach((): void => {
    soloConfigRuntimeState = new SoloConfigRuntimeState();
  });

  it('should load the configuration', async (): Promise<void> => {
    await soloConfigRuntimeState.load();
    expect(soloConfigRuntimeState.soloConfig).to.be.an('object');
    expect(soloConfigRuntimeState.soloConfig).to.have.property('helmChart');
    expect(soloConfigRuntimeState.soloConfig.helmChart).to.be.an('object');
    expect(soloConfigRuntimeState.soloConfig.helmChart.name).to.equal('solo-deployment');
    expect(soloConfigRuntimeState.soloConfig.helmChart.repository).to.equal('oci://ghcr.io/hashgraph/solo-charts');
  });

  it('should throw an error if the configuration is not loaded', (): void => {
    expect((): SoloConfig => soloConfigRuntimeState.soloConfig).to.throw(
      UnloadedConfigError,
      'SoloConfig is not loaded yet.',
    );
  });

  it('should return the directory', async (): Promise<void> => {
    const directory: string = '../solo-charts/charts';
    process.env.SOLO_SC_HELMCHART_DIRECTORY = directory;
    await soloConfigRuntimeState.load();
    const soloConfig: SoloConfig = soloConfigRuntimeState.soloConfig;
    expect(soloConfig).to.have.property('helmChart');
    expect(soloConfig.helmChart).to.have.property('directory');
    expect(soloConfig.helmChart.directory).to.equal(directory);
    expect(soloConfig.helmChart.repository).to.equal(directory);
  });
});
