// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {type DependencyManager} from '../../../../src/core/dependency-managers/index.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/local-config-runtime-state.js';

describe('DependencyManager', () => {
  let depManager: DependencyManager;

  before(async () => {
    resetForTest();
    depManager = container.resolve(InjectTokens.DependencyManager);
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    await localConfig.load();
  });

  describe('checkDependency', () => {
    it('should fail during invalid dependency check', async () => {
      await expect(depManager.checkDependency('INVALID_PROGRAM')).to.be.rejectedWith(
        "Dependency 'INVALID_PROGRAM' is not found",
      );
    });
  });
});
