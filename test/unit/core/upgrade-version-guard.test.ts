// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {assertUpgradeVersionNotOlder} from '../../../src/core/upgrade-version-guard.js';
import {SemanticVersion} from '../../../src/business/utils/semantic-version.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {optionFromFlag} from '../../../src/commands/command-helpers.js';
import {Flags as flags} from '../../../src/commands/flags.js';

describe('assertUpgradeVersionNotOlder', (): void => {
  const componentName: string = 'Test component';
  const flagHint: string = optionFromFlag(flags.upgradeVersion);

  it('should skip check when currentVersion is undefined', (): void => {
    expect((): void => {
      assertUpgradeVersionNotOlder(componentName, '0.60.0', undefined, flagHint);
    }).to.not.throw();
  });

  it('should skip check when currentVersion is null', (): void => {
    expect((): void => {
      // eslint-disable-next-line unicorn/no-null -- testing null because getComponentVersion callers annotate the return as nullable
      assertUpgradeVersionNotOlder(componentName, '0.60.0', null, flagHint);
    }).to.not.throw();
  });

  it('should skip check when currentVersion is 0.0.0', (): void => {
    const currentVersion: SemanticVersion<string> = new SemanticVersion('0.0.0');

    expect((): void => {
      assertUpgradeVersionNotOlder(componentName, '0.60.0', currentVersion, flagHint);
    }).to.not.throw();
  });

  it('should not throw when target equals current version', (): void => {
    const currentVersion: SemanticVersion<string> = new SemanticVersion('0.60.0');

    expect((): void => {
      assertUpgradeVersionNotOlder(componentName, '0.60.0', currentVersion, flagHint);
    }).to.not.throw();
  });

  it('should not throw when target is newer than current version', (): void => {
    const currentVersion: SemanticVersion<string> = new SemanticVersion('0.60.0');

    expect((): void => {
      assertUpgradeVersionNotOlder(componentName, '0.61.0', currentVersion, flagHint);
    }).to.not.throw();
  });

  it('should throw SoloError when target is older than current version', (): void => {
    const currentVersion: SemanticVersion<string> = new SemanticVersion('0.60.0');

    expect((): void => {
      assertUpgradeVersionNotOlder(componentName, '0.59.0', currentVersion, flagHint);
    }).to.throw(SoloError);
  });

  it('should include component name in error message', (): void => {
    const currentVersion: SemanticVersion<string> = new SemanticVersion('0.60.0');

    expect((): void => {
      assertUpgradeVersionNotOlder(componentName, '0.59.0', currentVersion, flagHint);
    }).to.throw(componentName);
  });

  it('should include flag hint in error message', (): void => {
    const currentVersion: SemanticVersion<string> = new SemanticVersion('0.60.0');

    expect((): void => {
      assertUpgradeVersionNotOlder(componentName, '0.59.0', currentVersion, flagHint);
    }).to.throw(flagHint);
  });
});
