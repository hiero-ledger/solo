// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {GetClustersRequest} from '../../../../../../src/integration/kind/request/get/get-clusters-request.js';
import {KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';

describe('GetClustersRequest', () => {
  let builder: KindExecutionBuilder;
  let request: GetClustersRequest;

  beforeEach(() => {
    // Create a stub for the builder
    builder = {
      subcommands: Sinon.stub().returnsThis()
    } as unknown as KindExecutionBuilder;

    // Create the request
    request = new GetClustersRequest();
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe('apply', () => {
    it('should add get clusters subcommands to the builder', () => {
      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('get', 'clusters');
    });
  });
});
