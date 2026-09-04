// SPDX-License-Identifier: Apache-2.0

import {it, describe} from 'mocha';
import {expect} from 'chai';

import * as constants from '../../../../src/core/constants.js';
import {type ChartManager} from '../../../../src/core/chart-manager.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';

describe('ChartManager', (): void => {
  const chartManager: ChartManager = container.resolve(InjectTokens.ChartManager);
  const chartNamespace: NamespaceName = constants.METRICS_SERVER_NAMESPACE;
  const releaseName: string = constants.METRICS_SERVER_RELEASE_NAME;

  it('should be able to list installed charts', async (): Promise<void> => {
    expect(chartNamespace, 'namespace should not be null').not.to.be.null;
    const list: string[] = await chartManager.getInstalledCharts(chartNamespace);
    expect(
      list.some((chart): boolean => chart.startsWith(`${releaseName} [`)),
      'should include metrics-server chart',
    ).to.be.ok;
  });

  it('should be able to check if a chart is installed', async (): Promise<void> => {
    expect(chartNamespace, 'namespace should not be null').not.to.be.null;
    const isInstalled: boolean = await chartManager.isChartInstalled(chartNamespace, releaseName);
    expect(isInstalled, `${releaseName} should be installed`).to.be.ok;
  });
});
