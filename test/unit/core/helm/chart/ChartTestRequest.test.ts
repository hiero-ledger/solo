// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {TestChartOptions} from '../../../../../src/core/helm/model/test/TestChartOptions.js';
import {ChartTestRequest} from '../../../../../src/core/helm/request/chart/ChartTestRequest.js';
import {type HelmExecutionBuilder} from '../../../../../src/core/helm/execution/HelmExecutionBuilder.js';

describe('ChartTestRequest Tests', () => {
  it('Test ChartTestRequest constructor validation', () => {
    // Should not throw with valid parameters
    expect(() => new ChartTestRequest('apache')).to.not.throw();
    expect(() => new ChartTestRequest('apache', TestChartOptions.defaults())).to.not.throw();

    // Test with custom options
    const opts = TestChartOptions.builder().timeout('9m0s').filter('filter').build();

    const nonDefaultOptRequest = new ChartTestRequest('apache', opts);

    // Verify behavior through apply method
    const helmExecutionBuilderMock = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
      argument: sinon.stub().returnsThis(),
    } as unknown as HelmExecutionBuilder;

    expect(nonDefaultOptRequest.options).to.equal(opts);
    expect(nonDefaultOptRequest.options).to.not.be.null;
    expect(nonDefaultOptRequest.options).not.equal(TestChartOptions.defaults());
  });
});
