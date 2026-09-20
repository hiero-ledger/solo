// SPDX-License-Identifier: Apache-2.0

/**
 * Setting one feature flag must not disturb any other.
 *
 * A config source carries only the flags actually set, and class-transformer blanks every other exposed
 * property to `undefined` instead of keeping the constructor's value. Read raw, `SKIP_NODE_PING=true` would
 * therefore make `enableImageCache` undefined — falsy — and silently turn the image cache off. FeatureFlags
 * goes through `FeatureFlagsSchema.withDefaults` to prevent exactly that.
 */

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {container} from 'tsyringe-neo';
import {type FeatureFlags} from '../../../../../src/business/runtime-state/config/solo/feature-flags.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {type ConfigProvider} from '../../../../../src/data/configuration/api/config-provider.js';
import {resetForTest} from '../../../../test-container.js';

async function flagsWith(variables: Record<string, string>): Promise<FeatureFlags> {
  for (const [key, value] of Object.entries(variables)) {
    process.env[key] = value;
  }
  resetForTest();
  await container.resolve<ConfigProvider>(InjectTokens.ConfigProvider).config().refresh();
  return container.resolve<FeatureFlags>(InjectTokens.FeatureFlags);
}

describe('feature flags – one flag set must not blank the others', (): void => {
  let saved: NodeJS.ProcessEnv;

  beforeEach((): void => {
    saved = {...process.env};
  });

  afterEach((): void => {
    process.env = saved;
  });

  it('leaves the opt-out image cache on when an unrelated flag is set', async (): Promise<void> => {
    const flags: FeatureFlags = await flagsWith({SKIP_NODE_PING: 'true'});

    expect(flags.skipNodePing).to.be.true;
    expect(flags.enableImageCache, 'enableImageCache must still default to true').to.be.true;
    expect(flags.copyWrapsLibraryInParallel).to.be.false;
    expect(flags.disableImporterSpringProfiles).to.be.false;
  });

  it('applies two flags at once without dropping either', async (): Promise<void> => {
    const flags: FeatureFlags = await flagsWith({SKIP_NODE_PING: 'true', ENABLE_IMAGE_CACHE: 'false'});

    expect(flags.skipNodePing).to.be.true;
    expect(flags.enableImageCache).to.be.false;
  });
});
