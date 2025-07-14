// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {GetNodesRequest} from '../../../../../../src/integration/kind/request/get/get-nodes-request.js';
import {type KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {type GetNodesOptions} from '../../../../../../src/integration/kind/model/get-nodes/get-nodes-options.js';

describe('GetNodesRequest', () => {
  let builder: KindExecutionBuilder;
  let request: GetNodesRequest;

  beforeEach(() => {
    // Create a stub for the builder
    builder = {
      subcommands: Sinon.stub().returnsThis()
    } as unknown as KindExecutionBuilder;
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe('apply', () => {
    it('should add get nodes subcommands to the builder', () => {
      // Create request with null options
      request = new GetNodesRequest(null as unknown as GetNodesOptions);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('get', 'nodes');
    });

    it('should delegate to options.apply when options are provided', () => {
      // Create mock options with a stub for apply method
      const options = {apply: Sinon.stub()} as unknown as GetNodesOptions;

      // Create request with options
      request = new GetNodesRequest(options);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('get', 'nodes');

      // Verify the options.apply method was called
      expect(options.apply).to.have.been.calledOnceWith(builder);
    });
  });
});
