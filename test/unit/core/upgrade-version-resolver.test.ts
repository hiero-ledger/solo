// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {UpgradeVersionResolver} from '../../../src/core/upgrade-version-resolver.js';
import {SemanticVersion} from '../../../src/business/utils/semantic-version.js';

describe('UpgradeVersionResolver.resolve', (): void => {
  const fallbackDefault: string = '0.159.0';

  it('should use the user-supplied version when provided, over remote config and default', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.152.0');

    const resolved: string = UpgradeVersionResolver.resolve('0.160.0', remoteConfigVersion, fallbackDefault);

    expect(resolved).to.equal('0.160.0');
  });

  it('should honor the user-supplied version even when it equals the built-in default', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.152.0');

    const resolved: string = UpgradeVersionResolver.resolve(fallbackDefault, remoteConfigVersion, fallbackDefault);

    expect(resolved).to.equal(fallbackDefault);
  });

  it('should use the remote config version when the user did not supply a version', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.152.0');

    const resolved: string = UpgradeVersionResolver.resolve(undefined, remoteConfigVersion, fallbackDefault);

    expect(resolved).to.equal('0.152.0');
  });

  it('should fall back to the default when the user did not supply a version and remote config is 0.0.0', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.0.0');

    const resolved: string = UpgradeVersionResolver.resolve(undefined, remoteConfigVersion, fallbackDefault);

    expect(resolved).to.equal(fallbackDefault);
  });

  it('should fall back to the default when the user did not supply a version and remote config is undefined', (): void => {
    const resolved: string = UpgradeVersionResolver.resolve(undefined, undefined, fallbackDefault);

    expect(resolved).to.equal(fallbackDefault);
  });

  it('should fall back to the default when the user did not supply a version and remote config is null', (): void => {
    // eslint-disable-next-line unicorn/no-null -- getComponentVersion callers annotate the return as nullable
    const resolved: string = UpgradeVersionResolver.resolve(undefined, null, fallbackDefault);

    expect(resolved).to.equal(fallbackDefault);
  });
});
