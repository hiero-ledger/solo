// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {RepositoryAddRequest} from '../../../../../src/integration/helm/request/repository/repository-add-request.js';
import {AddRepoOptions} from '../../../../../src/integration/helm/model/add/add-repo-options.js';

// Minimal mock for the Repository type
const mockRepository: {name: string; url: string} = {
  name: 'test-repo',
  url: 'https://example.com/chartrepo',
};

interface MockBuilder {
  subcommands: sinon.SinonStub;
  positional: sinon.SinonStub;
  flag: sinon.SinonStub;
}

describe('RepositoryAddRequest', (): void => {
  it('should add repo with required arguments', (): void => {
    const builder: MockBuilder = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
      flag: sinon.stub().returnsThis(),
    };
    const request: RepositoryAddRequest = new RepositoryAddRequest(mockRepository as any);
    request.apply(builder as any);

    expect(builder.subcommands.calledWith('repo', 'add')).to.be.true;
    expect(builder.positional.calledWith('test-repo')).to.be.true;
    expect(builder.positional.calledWith('https://example.com/chartrepo')).to.be.true;
  });

  it('should apply AddRepoOptions if provided', (): void => {
    const builder: MockBuilder = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
      flag: sinon.stub().returnsThis(),
    };
    const options: AddRepoOptions = new AddRepoOptions(true);
    const request: RepositoryAddRequest = new RepositoryAddRequest(mockRepository as any, options);
    request.apply(builder as any);

    expect(builder.flag.calledWith('--force-update')).to.be.true;
  });

  it('should not apply AddRepoOptions if not provided', (): void => {
    const builder: MockBuilder = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
      flag: sinon.stub().returnsThis(),
    };
    const request: RepositoryAddRequest = new RepositoryAddRequest(mockRepository as any);
    request.apply(builder as any);
    expect(builder.flag.calledWith('force-update')).to.be.false;
  });
});
