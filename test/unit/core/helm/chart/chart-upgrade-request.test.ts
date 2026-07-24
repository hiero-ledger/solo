// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {Chart} from '../../../../../src/integration/helm/model/chart.js';
import {ChartUpgradeRequest} from '../../../../../src/integration/helm/request/chart/chart-upgrade-request.js';
import {UpgradeChartOptionsBuilder} from '../../../../../src/integration/helm/model/upgrade/upgrade-chart-options-builder.js';
import {type UpgradeChartOptions} from '../../../../../src/integration/helm/model/upgrade/upgrade-chart-options.js';

describe('ChartUpgradeRequest Tests', (): void => {
  it('Test ChartUpgradeRequest Chart constructor validation', (): void => {
    const chart: Chart = new Chart('apache', 'bitnami/apache');
    const chartUpgradeRequest: ChartUpgradeRequest = new ChartUpgradeRequest('apache', chart);
    expect(chartUpgradeRequest.chart).to.equal(chart);
    expect(chartUpgradeRequest).to.not.be.null;
    expect(chartUpgradeRequest.releaseName).to.equal('apache');

    const options: UpgradeChartOptions = UpgradeChartOptionsBuilder.builder()
      .namespace('test-namespace')
      .kubeContext('test-context')
      .reuseValues(true)
      .build();
    const nonDefaultOptRequest: ChartUpgradeRequest = new ChartUpgradeRequest('apache', chart, options);

    expect(nonDefaultOptRequest.options).to.equal(options);
    expect(nonDefaultOptRequest.options).to.not.be.null;
    expect(nonDefaultOptRequest.options).not.equal(UpgradeChartOptionsBuilder.builder().build());
  });
});
