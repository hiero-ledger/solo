// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {Chart} from '../../../../../src/core/helm/model/Chart.js';
import {UpgradeChartOptions} from '../../../../../src/core/helm/model/upgrade/UpgradeChartOptions.js';
import {ChartUpgradeRequest} from '../../../../../src/core/helm/request/chart/ChartUpgradeRequest.js';

describe('ChartUpgradeRequest Tests', () => {
  it('Test ChartUpgradeRequest Chart constructor validation', () => {
    const chart = new Chart('apache', 'bitnami/apache');
    const chartUpgradeRequest = new ChartUpgradeRequest('apache', chart);
    expect(chartUpgradeRequest.chart).to.equal(chart);
    expect(chartUpgradeRequest).to.not.be.null;
    expect(chartUpgradeRequest.releaseName).to.equal('apache');

    const opts = UpgradeChartOptions.builder()
      .namespace('test-namespace')
      .kubeContext('test-context')
      .reuseValues(true)
      .build();
    const nonDefaultOptRequest = new ChartUpgradeRequest('apache', chart, opts);

    expect(nonDefaultOptRequest.options).to.equal(opts);
    expect(nonDefaultOptRequest.options).to.not.be.null;
    expect(nonDefaultOptRequest.options).not.equal(UpgradeChartOptions.builder().build());
  });
});
