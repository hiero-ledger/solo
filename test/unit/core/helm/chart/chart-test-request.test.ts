// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {ChartTestRequest} from '../../../../../src/integration/helm/request/chart/chart-test-request.js';
import {TestChartOptionsBuilder} from '../../../../../src/integration/helm/model/test/test-chart-options-builder.js';
import {type TestChartOptions} from '../../../../../src/integration/helm/model/test/test-chart-options.js';

describe('ChartTestRequest Tests', (): void => {
  it('Test ChartTestRequest constructor validation', (): void => {
    // Should not throw with valid parameters
    expect((): ChartTestRequest => new ChartTestRequest('apache')).to.not.throw();
    expect(
      (): ChartTestRequest => new ChartTestRequest('apache', TestChartOptionsBuilder.builder().build()),
    ).to.not.throw();

    // Test with custom options
    const options: TestChartOptions = TestChartOptionsBuilder.builder().timeout('9m0s').filter('filter').build();

    const nonDefaultOptRequest: ChartTestRequest = new ChartTestRequest('apache', options);

    expect(nonDefaultOptRequest.options).to.equal(options);
    expect(nonDefaultOptRequest.options).to.not.be.null;
    expect(nonDefaultOptRequest.options).not.equal(TestChartOptionsBuilder.builder().build());
  });
});
