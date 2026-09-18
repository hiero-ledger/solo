// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {EnvironmentAliasRegistry} from '../../decorators/environment-alias-registry.js';

/**
 * Boolean feature flags for Solo.
 *
 * <p>Flags are read through the layered configuration system, so each one is settable from the
 * environment with no extra plumbing. Three spellings resolve to the same flag, in descending
 * precedence:
 *
 * <ol>
 *   <li>{@code SOLO_FEATURE-FLAGS_<FLAG-NAME>} — generated from the property name by
 *       {@code EnvironmentKeyFormatter}; always available, always wins.</li>
 *   <li>{@code SOLO_FF_<FLAG_NAME>} — the readable alias for a standard flag.</li>
 *   <li>{@code EXPERIMENTAL_<FLAG_NAME>} — the alias for a flag that is still experimental.</li>
 * </ol>
 *
 * <p>A flag being promoted from experimental to standard keeps its {@code EXPERIMENTAL_*} alias and
 * gains a {@code SOLO_FF_*} one, so nobody's existing scripts break.
 *
 * <p>To add a flag:
 *
 * <ol>
 *   <li>Declare a boolean field here, defaulting to {@code false} in the constructor.</li>
 *   <li>Give it an alias: {@code SOLO_FF_<FLAG_NAME>}, or {@code EXPERIMENTAL_<FLAG_NAME>} while experimental.</li>
 *   <li>Expose a getter on {@link FeatureFlags} ({@code src/business/runtime-state/config/solo/feature-flags.ts}).</li>
 *   <li>Document it in {@code docs/site/content/en/docs/env.md}.</li>
 * </ol>
 *
 * <p>Defaults live here and only here. There is deliberately no {@code resources/config} defaults file for
 * feature flags: a second copy of every default is a second thing to keep in step, which is exactly how
 * {@code tss-config.yaml} came to pin a WRAPS version the schema had long since moved past.
 *
 * <p>Prefer {@code false} as the default: a flag that must be switched on to change behaviour is one
 * that can be removed without a release note once it ships. {@link enableImageCache} is the exception —
 * it was an opt-out switch before it was a flag.
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
}
