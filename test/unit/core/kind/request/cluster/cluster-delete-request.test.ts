// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {ClusterDeleteRequest} from '../../../../../../src/integration/kind/request/cluster/cluster-delete-request.js';
import {type KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {type ClusterDeleteOptions} from '../../../../../../src/integration/kind/model/delete-cluster/cluster-delete-options.js';

describe('ClusterDeleteRequest', (): void => {
  let builder: KindExecutionBuilder;
  let options: ClusterDeleteOptions;
  let request: ClusterDeleteRequest;

  beforeEach((): void => {
    // Create a stub for the builder
    builder = {
      subcommands: Sinon.stub().returnsThis(),
    } as unknown as KindExecutionBuilder;

    // Create mock options with a stub for apply method
    options = {apply: Sinon.stub()} as unknown as ClusterDeleteOptions;

    // Create the request with mocked options
    request = new ClusterDeleteRequest(options);
  });

  afterEach((): void => {
    Sinon.restore();
  });

  describe('constructor', (): void => {
    it('should create an instance with valid options', (): void => {
      expect(request).to.be.instanceOf(ClusterDeleteRequest);
    });

    it('should throw an error if options are null', (): void => {
      expect((): ClusterDeleteRequest => new ClusterDeleteRequest(null as unknown as ClusterDeleteOptions)).to.throw(
        'options must not be null',
      );
    });
  });

  describe('apply', (): void => {
    it('should add correct subcommands to the builder', (): void => {
      request.apply(builder);

      expect(builder.subcommands).to.have.been.calledOnceWith('delete', 'cluster');
    });

    it('should delegate to options.apply', (): void => {
      request.apply(builder);

      expect(options.apply).to.have.been.calledOnceWith(builder);
    });
  });
});
