// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {ClusterCreateRequest} from '../../../../../src/integration/kind/request/cluster/cluster-create-request.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {type ClusterCreateOptions} from '../../../../../src/integration/kind/model/create-cluster/cluster-create-options.js';

describe('ClusterCreateRequest', (): void => {
  let builder: KindExecutionBuilder;
  let options: ClusterCreateOptions;
  let request: ClusterCreateRequest;

  beforeEach((): void => {
    // Create mock objects
    builder = Sinon.createStubInstance(KindExecutionBuilder) as unknown as KindExecutionBuilder;
    // Restore the chaining behavior for builder methods
    (builder.subcommands as Sinon.SinonStub).returns(builder);

    // Create options with a stub for apply method
    options = {apply: Sinon.stub()} as unknown as ClusterCreateOptions;

    // Create the request with mocked options
    request = new ClusterCreateRequest(options);
  });

  afterEach((): void => {
    Sinon.restore();
  });

  describe('constructor', (): void => {
    it('should create an instance with valid options', (): void => {
      expect(request).to.be.instanceOf(ClusterCreateRequest);
    });

    it('should throw an error if options are null', (): void => {
      expect((): ClusterCreateRequest => new ClusterCreateRequest(null as unknown as ClusterCreateOptions)).to.throw(
        'options must not be null',
      );
    });
  });

  describe('apply', (): void => {
    it('should add correct subcommands to the builder', (): void => {
      request.apply(builder);

      expect(builder.subcommands).to.have.been.calledOnceWith('create', 'cluster');
    });

    it('should delegate to options.apply', (): void => {
      request.apply(builder);

      expect(options.apply).to.have.been.calledOnceWith(builder);
    });
  });
});
