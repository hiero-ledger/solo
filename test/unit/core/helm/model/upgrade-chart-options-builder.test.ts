// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {type HelmExecutionBuilder} from '../../../../../src/integration/helm/execution/helm-execution-builder.js';
import {UpgradeChartOptionsBuilder} from '../../../../../src/integration/helm/model/upgrade/upgrade-chart-options-builder.js';
import {type UpgradeChartOptions} from '../../../../../src/integration/helm/model/upgrade/upgrade-chart-options.js';

describe('UpgradeChartOptionsBuilder Tests', (): void => {
  it('Test UpgradeChartOptionsBuilder', (): void => {
    const options: UpgradeChartOptions = UpgradeChartOptionsBuilder.builder()
      .namespace('test-namespace')
      .kubeContext('test-context')
      .reuseValues(true)
      .valueArguments(['--debug'])
      .build();

    // Verify all options are set correctly
    expect(options).to.not.be.null;
    expect(options.namespace).to.equal('test-namespace');
    expect(options.kubeContext).to.equal('test-context');
    expect(options.reuseValues).to.be.true;
    expect(options.valueArguments).to.deep.equal(['--debug']);
  });

  it('Test apply method', (): void => {
    const options: UpgradeChartOptions = UpgradeChartOptionsBuilder.builder()
      .namespace('test-namespace')
      .kubeContext('test-context')
      .reuseValues(true)
      .valueArguments(['--debug'])
      .build();

    type MockBuilder = HelmExecutionBuilder & {
      argument: sinon.SinonStub;
      flag: sinon.SinonStub;
      positional: sinon.SinonStub;
      arguments: sinon.SinonStub;
    };

    const builder: MockBuilder = {
      argument: sinon.stub(),
      flag: sinon.stub(),
      positional: sinon.stub(),
      arguments: sinon.stub(),
    } as unknown as MockBuilder;

    builder.argument.returns(builder);
    builder.flag.returns(builder);
    builder.positional.returns(builder);
    builder.arguments.returns(builder);

    options.apply(builder);

    // Verify builder methods were called with correct arguments
    expect(builder.argument.calledWith('namespace', 'test-namespace')).to.be.true;
    expect(builder.argument.calledWith('kube-context', 'test-context')).to.be.true;
    expect(builder.flag.calledWith('--reuse-values')).to.be.true;
    expect(builder.arguments.calledWith('--debug')).to.be.true;
  });

  it('Test builder with default values', (): void => {
    const options: UpgradeChartOptions = UpgradeChartOptionsBuilder.builder().build();

    // Verify default values
    expect(options).to.not.be.null;
    expect(options.namespace).to.be.undefined;
    expect(options.kubeContext).to.be.undefined;
    expect(options.reuseValues).to.be.false;
    expect(options.valueArguments).to.deep.equal([]);
  });

  it('Test apply method with default values', (): void => {
    const options: UpgradeChartOptions = UpgradeChartOptionsBuilder.builder().build();

    type MockBuilder = HelmExecutionBuilder & {
      argument: sinon.SinonStub;
      flag: sinon.SinonStub;
      positional: sinon.SinonStub;
    };

    const builder: MockBuilder = {
      argument: sinon.stub(),
      flag: sinon.stub(),
      positional: sinon.stub(),
    } as unknown as MockBuilder;

    builder.argument.returns(builder);
    builder.flag.returns(builder);
    builder.positional.returns(builder);

    options.apply(builder);

    // Verify only required builder methods were called
    expect(builder.argument.notCalled).to.be.false;
    expect(builder.flag.notCalled).to.be.true;
  });
});
