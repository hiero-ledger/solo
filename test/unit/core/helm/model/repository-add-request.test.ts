// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {RepositoryAddRequest} from '../../../../../src/integration/helm/request/repository/repository-add-request.js';
import {AddRepoOptions} from '../../../../../src/integration/helm/model/add/add-repo-options.js';

// Minimal mock for the Repository type
const mockRepository = {
  name: 'test-repo',
  url: 'https://example.com/chartrepo',
};

describe('RepositoryAddRequest', () => {
  it('should add repo with required arguments', () => {
    const builder = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
      flag: sinon.stub().returnsThis(),
    };
    const request = new RepositoryAddRequest(mockRepository as any);
    request.apply(builder as any);

    expect(builder.subcommands.calledWith('repo', 'add')).to.be.true;
    expect(builder.positional.calledWith('test-repo')).to.be.true;
    expect(builder.positional.calledWith('https://example.com/chartrepo')).to.be.true;
  });

  it('should apply AddRepoOptions if provided', () => {
    const builder = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
      flag: sinon.stub().returnsThis(),
    };
    const options = new AddRepoOptions(true);
    const request = new RepositoryAddRequest(mockRepository as any, options);
    request.apply(builder as any);

    expect(builder.flag.calledWith('force-update')).to.be.true;
  });

  it('should not apply AddRepoOptions if not provided', () => {
    const builder = {
      subcommands: sinon.stub().returnsThis(),
      positional: sinon.stub().returnsThis(),
      flag: sinon.stub().returnsThis(),
    };
    const request = new RepositoryAddRequest(mockRepository as any);
    request.apply(builder as any);
    expect(builder.flag.calledWith('force-update')).to.be.false;
  });
});
