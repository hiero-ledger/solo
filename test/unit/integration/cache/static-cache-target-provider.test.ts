// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {CacheTarget} from '../../../../src/integration/cache/models/impl/cache-target.js';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';
import {StaticCacheTargetProvider} from '../../../../src/integration/cache/target-providers/static-cache-target-provider.js';

describe('StaticCacheTargetProvider', (): void => {
  it('should return provided targets', async (): Promise<void> => {
    const targets: readonly CacheTarget[] = [
      new CacheTarget(CacheArtifactEnum.IMAGE, 'ghcr.io/hashgraph/solo', '1.0.0', 'ghcr.io'),
      new CacheTarget(CacheArtifactEnum.HELM_CHART, 'cert-manager', 'v1.17.1', 'jetstack'),
    ];

    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider(targets);

    expect(await provider.getRequiredTargets()).to.equal(targets);
  });

  it('should return empty array when initialized with empty targets', async (): Promise<void> => {
    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([]);

    expect(await provider.getRequiredTargets()).to.deep.equal([]);
  });
});
