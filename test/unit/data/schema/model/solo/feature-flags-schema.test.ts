// SPDX-License-Identifier: Apache-2.0

/**
 * Covers the feature-flag defaults, the FeatureFlags service, and the bootstrap invariant they depend on:
 * config sources must be loaded before a flag can read anything but its default.
 */

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import {container} from 'tsyringe-neo';
import {SoloConfigSchema} from '../../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {FeatureFlagsSchema} from '../../../../../../src/data/schema/model/solo/feature-flags-schema.js';
import {FeatureFlags} from '../../../../../../src/business/runtime-state/config/solo/feature-flags.js';
import {SoloConfig} from '../../../../../../src/business/runtime-state/config/solo/solo-config.js';
import {WrapsSchema} from '../../../../../../src/data/schema/model/solo/wraps-schema.js';
import {type ConfigProvider} from '../../../../../../src/data/configuration/api/config-provider.js';
import {InjectTokens} from '../../../../../../src/core/dependency-injection/inject-tokens.js';
import {resetForTest} from '../../../../../test-container.js';
import {EnvironmentAliasRegistry} from '../../../../../../src/data/schema/decorators/environment-alias-registry.js';

describe('FeatureFlagsSchema', (): void => {
  it('preserves the default of every toggle migrated out of constants.ts', (): void => {
    const flags: FeatureFlagsSchema = new FeatureFlagsSchema();

    expect(flags.copyWrapsLibraryInParallel).to.be.false;
    expect(flags.skipNodePing).to.be.false;
    expect(flags.disableImporterSpringProfiles).to.be.false;
    // The one opt-out flag: ENABLE_IMAGE_CACHE was on unless explicitly set to 'false'.
    expect(flags.enableImageCache).to.be.true;
  });

  it('keeps every legacy environment variable name working', (): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
    const aliases: ReadonlyMap<string, string> = EnvironmentAliasRegistry.aliasMap();

    // Old names — CI workflows and user scripts still set these.
    expect(aliases.get('EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL')).to.equal('featureFlags.copyWrapsLibraryInParallel');
    expect(aliases.get('SKIP_NODE_PING')).to.equal('featureFlags.skipNodePing');
    expect(aliases.get('DISABLE_IMPORTER_SPRING_PROFILES')).to.equal('featureFlags.disableImporterSpringProfiles');
    expect(aliases.get('ENABLE_IMAGE_CACHE')).to.equal('featureFlags.enableImageCache');

    // New names.
    expect(aliases.get('SOLO_FF_SKIP_NODE_PING')).to.equal('featureFlags.skipNodePing');
    expect(aliases.get('SOLO_FF_DISABLE_IMPORTER_SPRING_PROFILES')).to.equal(
      'featureFlags.disableImporterSpringProfiles',
    );
    expect(aliases.get('SOLO_FF_ENABLE_IMAGE_CACHE')).to.equal('featureFlags.enableImageCache');
  });

  describe('withDefaults', (): void => {
    it('fills in flags the config system left unset', (): void => {
      // A config source only carries the flags actually set; the rest arrive undefined.
      const flags: FeatureFlagsSchema = FeatureFlagsSchema.withDefaults({skipNodePing: true});

      expect(flags.skipNodePing).to.be.true;
      expect(flags.enableImageCache).to.be.true;
      expect(flags.copyWrapsLibraryInParallel).to.be.false;
      expect(flags.disableImporterSpringProfiles).to.be.false;
    });

    it('keeps an explicit false rather than treating it as unset', (): void => {
      expect(FeatureFlagsSchema.withDefaults({enableImageCache: false}).enableImageCache).to.be.false;
    });

    it('returns all defaults when nothing is configured', (): void => {
      expect(FeatureFlagsSchema.withDefaults()).to.deep.equal(new FeatureFlagsSchema());
    });
  });
});

describe('FeatureFlags', (): void => {
  let featureFlags: FeatureFlags;
  let configProvider: ConfigProvider;

  beforeEach((): void => {
    resetForTest();
    featureFlags = container.resolve<FeatureFlags>(InjectTokens.FeatureFlags);
    configProvider = container.resolve<ConfigProvider>(InjectTokens.ConfigProvider);
  });

  it('is resolvable from the container', (): void => {
    expect(featureFlags).to.be.instanceOf(FeatureFlags);
  });

  it('reads defaults before the config sources are loaded', (): void => {
    expect(featureFlags.enableImageCache).to.be.true;
    expect(featureFlags.skipNodePing).to.be.false;
  });

  it('reads through to the config provider rather than a constructor snapshot', async (): Promise<void> => {
    // The singleton is built during container init, before main() loads the sources. A snapshot taken in
    // the constructor would be stuck at the defaults forever.
    await configProvider.config().refresh();
    expect(featureFlags.enableImageCache).to.be.true;
  });
});

describe('config source loading (feature flags depend on it)', (): void => {
  let configProvider: ConfigProvider;

  beforeEach((): void => {
    resetForTest();
    configProvider = container.resolve<ConfigProvider>(InjectTokens.ConfigProvider);
  });

  it('yields nothing at all while the sources are unloaded', (): void => {
    // Documents the trap: without a refresh, resources/config/*.yaml and every SOLO_* override are inert.
    expect(configProvider.config().asObject(SoloConfigSchema)).to.not.exist;
  });

  it('resolves YAML-backed values once the sources are loaded', async (): Promise<void> => {
    await configProvider.config().refresh();

    // helmChart.name only ever has this value if helm-chart-config.yaml was actually read —
    // the schema constructor defaults it to the empty string.
    expect(SoloConfig.getConfig(configProvider).helmChart.name).to.equal('solo-deployment');
  });

  it('keeps resources/config/tss-config.yaml in step with the WRAPS schema defaults', async (): Promise<void> => {
    // The YAML outranks the schema constructor defaults at runtime, so drift between the two silently
    // changes which WRAPS artifacts are downloaded. The file sat on v0.2.0 while the schema moved to
    // v1.0.0 precisely because nothing loaded it.
    await configProvider.config().refresh();

    const defaults: WrapsSchema = new WrapsSchema();
    const config: SoloConfig = SoloConfig.getConfig(configProvider);

    expect(config.tss.wraps.directoryName).to.equal(defaults.directoryName);
    expect(config.tss.wraps.artifactsFolderName).to.equal(defaults.artifactsFolderName);
    expect(config.tss.wraps.libraryDownloadUrl).to.equal(defaults.libraryDownloadUrl);
    expect(config.tss.wraps.allowedKeyFiles).to.equal(defaults.allowedKeyFiles);
  });
});
