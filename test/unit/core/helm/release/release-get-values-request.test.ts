// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it} from 'mocha';

import {type HelmExecutionBuilder} from '../../../../../src/integration/helm/execution/helm-execution-builder.js';
import {ReleaseGetValuesRequest} from '../../../../../src/integration/helm/request/release/release-get-values-request.js';

describe('ReleaseGetValuesRequest', (): void => {
  const buildBuilder: () => HelmExecutionBuilder = (): HelmExecutionBuilder =>
    ({
      argument: sinon.stub().returnsThis(),
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
    }) as unknown as HelmExecutionBuilder;

  it('reads the user-supplied values of the release as JSON in its namespace and context', (): void => {
    const builder: HelmExecutionBuilder = buildBuilder();

    new ReleaseGetValuesRequest('mirror-1', 'solo-ns', 'kind-ctx').apply(builder);

    expect(builder.argument).to.have.been.calledWith('output', 'json');
    expect(builder.argument).to.have.been.calledWith('namespace', 'solo-ns');
    expect(builder.argument).to.have.been.calledWith('kube-context', 'kind-ctx');
    expect(builder.subcommands).to.have.been.calledOnceWith('get', 'values');
    expect(builder.positional).to.have.been.calledOnceWith('mirror-1');
  });

  it('omits the kube context when none is given', (): void => {
    const builder: HelmExecutionBuilder = buildBuilder();

    new ReleaseGetValuesRequest('mirror-1', 'solo-ns').apply(builder);

    expect(builder.argument).to.not.have.been.calledWith('kube-context');
  });
});
