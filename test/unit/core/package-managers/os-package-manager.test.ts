// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, beforeEach, afterEach, describe, it} from 'mocha';
import sinon from 'sinon';
import fs from 'node:fs';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {OsPackageManager} from '../../../../src/core/package-managers/os-package-manager.js';
import {BrewPackageManager} from '../../../../src/core/package-managers/brew-package-manager.js';
import {AptGetPackageManager} from '../../../../src/core/package-managers/apt-get-package-manager.js';
import {DnfPackageManager} from '../../../../src/core/package-managers/dnf-package-manager.js';
import {ZypperPackageManager} from '../../../../src/core/package-managers/zypper-package-manager.js';
import {PacmanPackageManager} from '../../../../src/core/package-managers/pacman-package-manager.js';
import {ApkPackageManager} from '../../../../src/core/package-managers/apk-package-manager.js';

function buildOsPackageManager(): OsPackageManager {
  return new OsPackageManager(
    new BrewPackageManager(),
    new AptGetPackageManager(),
    new DnfPackageManager(),
    new ZypperPackageManager(),
    new PacmanPackageManager(),
    new ApkPackageManager(),
  );
}

const detectionCases: Array<{name: string; osRelease: string; expectedManager: string}> = [
  {name: 'Fedora', osRelease: 'ID=fedora\nVERSION_ID=40\n', expectedManager: 'DnfPackageManager'},
  {name: 'Ubuntu', osRelease: 'ID=ubuntu\nID_LIKE=debian\n', expectedManager: 'AptGetPackageManager'},
  {name: 'Debian', osRelease: 'ID=debian\n', expectedManager: 'AptGetPackageManager'},
  {
    name: 'openSUSE Leap',
    osRelease: 'ID="opensuse-leap"\nID_LIKE="suse opensuse"\n',
    expectedManager: 'ZypperPackageManager',
  },
  {name: 'Arch', osRelease: 'ID=arch\n', expectedManager: 'PacmanPackageManager'},
  {name: 'Alpine', osRelease: 'ID=alpine\n', expectedManager: 'ApkPackageManager'},
  {
    name: 'Rocky (matched via ID_LIKE)',
    osRelease: 'ID=rocky\nID_LIKE="rhel centos fedora"\n',
    expectedManager: 'DnfPackageManager',
  },
];

describe('OsPackageManager Linux distribution detection', (): void => {
  before((): void => {
    resetForTest();
  });

  beforeEach((): void => {
    container.register(InjectTokens.OsPlatform, {useValue: 'linux'});
  });

  afterEach((): void => {
    sinon.restore();
  });

  for (const detectionCase of detectionCases) {
    it(`selects ${detectionCase.expectedManager} for ${detectionCase.name}`, (): void => {
      sinon.stub(fs, 'readFileSync').returns(detectionCase.osRelease);
      const osPackageManager: OsPackageManager = buildOsPackageManager();
      expect(osPackageManager.getPackageManager().constructor.name).to.equal(detectionCase.expectedManager);
    });
  }

  it('throws a clear error for an unsupported distribution with no known package manager', (): void => {
    sinon.stub(fs, 'readFileSync').returns('ID=plan9\n');
    sinon.stub(fs, 'accessSync').throws(new Error('not found'));
    expect((): OsPackageManager => buildOsPackageManager()).to.throw(/Unsupported Linux distribution 'plan9'/);
  });
});
