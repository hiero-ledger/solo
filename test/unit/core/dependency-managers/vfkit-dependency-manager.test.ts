// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';

import {resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type VfkitDependencyManager} from '../../../../src/core/dependency-managers/vfkit-dependency-manager.js';
import {OperatingSystem} from '../../../../src/business/utils/operating-system.js';

describe('VfkitDependencyManager', (): void => {
  let vfkitDependencyManager: VfkitDependencyManager;

  beforeEach((): void => {
    resetForTest();
    vfkitDependencyManager = container.resolve<VfkitDependencyManager>(InjectTokens.VfkitDependencyManager);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('shouldInstall', (): void => {
    it('should return true on macOS (darwin)', async (): Promise<void> => {
      sinon.stub(OperatingSystem, 'isDarwin').returns(true);
      expect(await vfkitDependencyManager.shouldInstall()).to.be.true;
    });

    it('should return false on Windows (win32)', async (): Promise<void> => {
      sinon.stub(OperatingSystem, 'isDarwin').returns(false);
      expect(await vfkitDependencyManager.shouldInstall()).to.be.false;
    });

    it('should return false on Linux', async (): Promise<void> => {
      sinon.stub(OperatingSystem, 'isDarwin').returns(false);
      expect(await vfkitDependencyManager.shouldInstall()).to.be.false;
    });
  });

  describe('getVerifyChecksum', (): void => {
    it('should return false', (): void => {
      expect(vfkitDependencyManager.getVerifyChecksum()).to.be.false;
    });
  });
});
