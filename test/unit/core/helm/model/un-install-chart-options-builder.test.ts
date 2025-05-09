// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {type HelmExecutionBuilder} from '../../../../../src/integration/helm/execution/helm-execution-builder.js';
import {UnInstallChartOptionsBuilder} from '../../../../../src/integration/helm/model/install/un-install-chart-options-builder.js';

describe('UnInstallChartOptionsBuilder Tests', () => {
  it('Test UnInstallChartOptionsBuilder', () => {
    const options = UnInstallChartOptionsBuilder.builder()
      .namespace('test-namespace')
      .kubeContext('test-context')
      .build();

    // Verify all options are set correctly
    expect(options).to.not.be.null;
    expect(options.namespace).to.equal('test-namespace');
    expect(options.kubeContext).to.equal('test-context');
  });

  it('Test apply method', () => {
    const options = UnInstallChartOptionsBuilder.builder()
      .namespace('test-namespace')
      .kubeContext('test-context')
      .build();

    type MockBuilder = HelmExecutionBuilder & {
      flag: sinon.SinonStub;
      argument: sinon.SinonStub;
      positional: sinon.SinonStub;
    };

    const builderMock = {
      flag: sinon.stub().returnsThis(),
      argument: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
    } as unknown as MockBuilder;

    options.apply(builderMock);

    // Verify builder methods were called with correct arguments
    expect(builderMock.argument.calledWith('namespace', 'test-namespace')).to.be.true;
    expect(builderMock.argument.calledWith('kube-context', 'test-context')).to.be.true;
  });

  it('Test builder with default values', () => {
    const options = UnInstallChartOptionsBuilder.builder().build();

    // Verify default values
    expect(options).to.not.be.null;
    expect(options.namespace).to.be.undefined;
    expect(options.kubeContext).to.be.undefined;
  });
});
