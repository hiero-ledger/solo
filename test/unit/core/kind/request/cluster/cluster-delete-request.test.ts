// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {ClusterDeleteRequest} from '../../../../../../src/integration/kind/request/cluster/cluster-delete-request.js';
import {KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {ClusterDeleteOptions} from '../../../../../../src/integration/kind/model/delete-cluster/cluster-delete-options.js';

describe('ClusterDeleteRequest', () => {
  let builder: KindExecutionBuilder;
  let options: ClusterDeleteOptions;
  let request: ClusterDeleteRequest;

  beforeEach(() => {
    // Create a stub for the builder
    builder = {
      subcommands: Sinon.stub().returnsThis()
    } as unknown as KindExecutionBuilder;

    // Create mock options with a stub for apply method
    options = { apply: Sinon.stub() } as unknown as ClusterDeleteOptions;

    // Create the request with mocked options
    request = new ClusterDeleteRequest(options);
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe('constructor', () => {
    it('should create an instance with valid options', () => {
      expect(request).to.be.instanceOf(ClusterDeleteRequest);
    });

    it('should throw an error if options are null', () => {
      expect(() => new ClusterDeleteRequest(null as unknown as ClusterDeleteOptions)).to.throw('options must not be null');
    });
  });

  describe('apply', () => {
    it('should add correct subcommands to the builder', () => {
      request.apply(builder);

      expect(builder.subcommands).to.have.been.calledOnceWith('delete', 'cluster');
    });

    it('should delegate to options.apply', () => {
      request.apply(builder);

      expect(options.apply).to.have.been.calledOnceWith(builder);
    });
  });
});
