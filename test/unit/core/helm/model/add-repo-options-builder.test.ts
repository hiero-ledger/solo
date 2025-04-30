// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';
import {AddRepoOptions} from '../../../../../src/integration/helm/model/add/add-repo-options.js';
import {AddRepoOptionsBuilder} from '../../../../../src/integration/helm/model/add/add-repo-options-builder.js';
import {type HelmExecutionBuilder} from '../../../../../src/integration/helm/execution/helm-execution-builder.js';

describe('AddRepoOptionsBuilder Tests', (): void => {
  it('should build AddRepoOptions with default values', (): void => {
    const options: AddRepoOptions = new AddRepoOptionsBuilder().build();
    expect(options).to.not.be.null;
    expect(options.forceUpdate).to.be.false;
  });

  it('should build AddRepoOptions with forceUpdate = true', (): void => {
    const options: AddRepoOptions = new AddRepoOptionsBuilder().forceUpdate(true).build();
    expect(options).to.not.be.null;
    expect(options.forceUpdate).to.be.true;
  });
});

describe('AddRepoOptions Tests', (): void => {
  it('should set forceUpdate correctly via constructor', (): void => {
    const optionsTrue: AddRepoOptions = new AddRepoOptions(true);
    const optionsFalse: AddRepoOptions = new AddRepoOptions(false);
    expect(optionsTrue.forceUpdate).to.be.true;
    expect(optionsFalse.forceUpdate).to.be.false;
  });

  it('should apply --force-update flag when set', (): void => {
    const flagStub = sinon.stub().returnsThis();
    const builderMock = {flag: flagStub} as unknown as HelmExecutionBuilder;
    const options: AddRepoOptions = new AddRepoOptions(true);
    options.apply(builderMock);
    expect(flagStub.calledWith('--force-update')).to.be.true;
  });

  it('should not apply --force-update flag when not set', (): void => {
    const flagStub = sinon.stub().returnsThis();
    const builderMock = {flag: flagStub} as unknown as HelmExecutionBuilder;
    const options: AddRepoOptions = new AddRepoOptions(false);
    options.apply(builderMock);
    expect(flagStub.calledWith('--force-update')).to.be.false;
  });
});
