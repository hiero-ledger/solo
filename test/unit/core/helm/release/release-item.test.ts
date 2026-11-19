// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {ReleaseItem} from '../../../../../src/integration/helm/model/release/release-item.js';

describe('ReleaseItem', (): void => {
  const releaseOf: (chart: string) => ReleaseItem = (chart: string): ReleaseItem =>
    new ReleaseItem('release', 'solo', '1', '', 'deployed', chart, '');

  const cases: [string, string | undefined, string | undefined][] = [
    ['hedera-mirror-0.157.0', 'hedera-mirror', '0.157.0'],
    ['solo-deployment-0.60.0-rc.1', 'solo-deployment', '0.60.0-rc.1'],
    ['block-node-server-v0.28.1', 'block-node-server', 'v0.28.1'],
    ['hiero-explorer-chart-26.0.0+build.5', 'hiero-explorer-chart', '26.0.0+build.5'],
    ['chart-without-version', undefined, undefined],
    ['', undefined, undefined],
  ];

  for (const [chart, expectedName, expectedVersion] of cases) {
    it(`parses '${chart}' as chart ${expectedName} at version ${expectedVersion}`, (): void => {
      expect(releaseOf(chart).chartName).to.equal(expectedName);
      expect(releaseOf(chart).chartVersion).to.equal(expectedVersion);
    });
  }

  it('parses the chart of a release deserialized from `helm list` output', (): void => {
    const release: ReleaseItem = Object.assign(new (ReleaseItem as unknown as new () => ReleaseItem)(), {
      chart: 'hedera-mirror-0.152.0',
    });
    expect(release.chartName).to.equal('hedera-mirror');
    expect(release.chartVersion).to.equal('0.152.0');
  });
});
