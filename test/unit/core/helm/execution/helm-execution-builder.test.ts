// SPDX-License-Identifier: Apache-2.0

import {HelmExecutionBuilder} from '../../../../../src/integration/helm/execution/helm-execution-builder.js';
import {expect} from 'chai';

describe('HelmExecutionBuilder', (): void => {
  it('Test optionsWithMultipleValues null checks', (): void => {
    const builder: HelmExecutionBuilder = new HelmExecutionBuilder();
    expect((): void => {
      builder.optionsWithMultipleValues(null as any, null as any);
    }).to.throw(Error);
    expect((): void => {
      builder.optionsWithMultipleValues('test string', null as any);
    }).to.throw(Error);
  });

  it('Test environmentVariable null checks', (): void => {
    const builder: HelmExecutionBuilder = new HelmExecutionBuilder();
    expect((): void => {
      builder.environmentVariable(null as any, null as any);
    }).to.throw(Error);
    expect((): void => {
      builder.environmentVariable('test string', null as any);
    }).to.throw(Error);
  });
});
