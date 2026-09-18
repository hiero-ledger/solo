// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type FeatureFlagsSchema} from '../../../../data/schema/model/solo/feature-flags-schema.js';

/**
 * Typed read access to the boolean feature flags declared on {@link FeatureFlagsSchema}.
 *
 * <p>Reached through the projected configuration, alongside the other schema facades:
 *
 * <pre>
 *   if (this.soloConfig.featureFlags.oneShotResume) {
 *     // …
 *   }
 * </pre>
 *
 * <p>See {@link FeatureFlagsSchema} for how to add one. Each flag gets a getter here so call sites never
 * touch the schema directly.
 */
export class FeatureFlags implements Facade<FeatureFlagsSchema> {
  public constructor(public readonly encapsulatedObject: FeatureFlagsSchema) {}

  public get copyWrapsLibraryInParallel(): boolean {
    return this.encapsulatedObject.copyWrapsLibraryInParallel;
  }

  public get skipNodePing(): boolean {
    return this.encapsulatedObject.skipNodePing;
  }

  public get disableImporterSpringProfiles(): boolean {
    return this.encapsulatedObject.disableImporterSpringProfiles;
  }

  public get enableImageCache(): boolean {
    return this.encapsulatedObject.enableImageCache;
  }
}
