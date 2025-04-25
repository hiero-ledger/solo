// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/local-config-runtime-state.js';
import {LocalConfig} from '../../../../src/data/schema/model/local/local-config.js';

describe('LocalConfigRuntimeState', () => {
  it('Should instantiate LocalConfigRuntimeState', async () => {
    container.resolve(InjectTokens.LocalConfigRuntimeState);
    const instance = container.resolve(InjectTokens.LocalConfigRuntimeState) as LocalConfigRuntimeState;
    expect(instance).to.exist;
    await instance.configFileExists();
    await instance.create();
    await instance.load();
    expect(instance.userIdentity).to.exist;
    expect(instance.deployments).to.exist;
    expect(instance.clusterRefs).to.exist;

    await instance.modify(async (data: LocalConfig) => {
      expect(data).to.exist;
      expect(data).to.exist;
      expect(data.userIdentity).to.exist;
      expect(data.deployments).to.exist;
      expect(data.clusterRefs).to.exist;
      expect(data.versions).to.exist;
    });
  });
});
