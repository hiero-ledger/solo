// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {EnvironmentAliasRegistry} from '../../decorators/environment-alias-registry.js';

/**
 * Boolean feature flags, settable from the environment as {@code SOLO_FEATURE-FLAGS_<FLAG-NAME>} (generated,
 * highest precedence), {@code SOLO_FF_<FLAG_NAME>}, or {@code EXPERIMENTAL_<FLAG_NAME>} while experimental.
 * See {@code docs/site/content/en/docs/env.md}.
 *
 * <p>To add a flag: declare it here defaulting to {@code false}, alias it, add a getter to {@link FeatureFlags},
 * and document it. Defaults live here only — no {@code resources/config} file, so there is nothing to drift.
 */
@Exclude()
export class FeatureFlagsSchema {
  /** Copy the WRAPS library into consensus nodes concurrently rather than one node at a time. */
  @Expose()
  @EnvironmentAliasRegistry.alias('EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL')
  public copyWrapsLibraryInParallel: boolean;

  /** Skip the consensus node ping that guards node client reuse. */
  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_FF_SKIP_NODE_PING', 'SKIP_NODE_PING')
  public skipNodePing: boolean;

  /** Leave the mirror node importer pulling from the consensus node instead of injecting a block node profile. */
  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_FF_DISABLE_IMPORTER_SPRING_PROFILES', 'DISABLE_IMPORTER_SPRING_PROFILES')
  public disableImporterSpringProfiles: boolean;

  /** Cache container images locally. Defaults on — this one is an opt-out. */
  @Expose()
  @EnvironmentAliasRegistry.alias('SOLO_FF_ENABLE_IMAGE_CACHE', 'ENABLE_IMAGE_CACHE')
  public enableImageCache: boolean;

  public constructor(
    copyWrapsLibraryInParallel?: boolean,
    skipNodePing?: boolean,
    disableImporterSpringProfiles?: boolean,
    enableImageCache?: boolean,
  ) {
    this.copyWrapsLibraryInParallel = copyWrapsLibraryInParallel ?? false;
    this.skipNodePing = skipNodePing ?? false;
    this.disableImporterSpringProfiles = disableImporterSpringProfiles ?? false;
    this.enableImageCache = enableImageCache ?? true;
  }

  /**
   * Fills every flag the config system left unset with its default.
   *
   * <p>A config source only carries the flags actually set, and class-transformer blanks the rest to
   * {@code undefined} instead of keeping the constructor's value. Without this, setting any one flag would
   * read every other flag as falsy — so {@code SKIP_NODE_PING=true} would also switch the image cache off.
   */
  public static withDefaults(configured?: Partial<FeatureFlagsSchema>): FeatureFlagsSchema {
    const set: Partial<FeatureFlagsSchema> = Object.fromEntries(
      Object.entries(configured ?? {}).filter(([, value]: [string, unknown]): boolean => value !== undefined),
    );
    return Object.assign(new FeatureFlagsSchema(), set);
  }
}
