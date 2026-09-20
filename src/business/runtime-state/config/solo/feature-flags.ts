// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {type ConfigProvider} from '../../../../data/configuration/api/config-provider.js';
import {FeatureFlagsSchema} from '../../../../data/schema/model/solo/feature-flags-schema.js';
import {SoloConfigSchema} from '../../../../data/schema/model/solo/solo-config-schema.js';

/**
 * Reads Solo's boolean feature flags. Inject it and read a flag off it:
 *
 * <pre>
 *   &#64;inject(InjectTokens.FeatureFlags) private readonly featureFlags?: FeatureFlags,
 *   ...
 *   if (this.featureFlags.skipNodePing) { ... }
 * </pre>
 *
 * <p>Every read goes to the config provider rather than to a value captured in the constructor. This class
 * is a singleton, so it is built during container initialisation — before {@code main()} loads the config
 * sources. A captured value would be the schema default forever, whatever the environment said.
 *
 * <p>See {@link FeatureFlagsSchema} for the flags themselves.
 */
@injectable()
export class FeatureFlags {
  public constructor(@inject(InjectTokens.ConfigProvider) private readonly configProvider?: ConfigProvider) {
    this.configProvider = patchInject(configProvider, InjectTokens.ConfigProvider, this.constructor.name);
  }

  public get copyWrapsLibraryInParallel(): boolean {
    return this.current.copyWrapsLibraryInParallel;
  }

  public get skipNodePing(): boolean {
    return this.current.skipNodePing;
  }

  public get disableImporterSpringProfiles(): boolean {
    return this.current.disableImporterSpringProfiles;
  }

  public get enableImageCache(): boolean {
    return this.current.enableImageCache;
  }

  /** The flags as currently configured, with anything unset filled in from the schema defaults. */
  private get current(): FeatureFlagsSchema {
    return FeatureFlagsSchema.withDefaults(this.configProvider.config().asObject(SoloConfigSchema)?.featureFlags);
  }
}
