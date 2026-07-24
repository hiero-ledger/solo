// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {GetClustersRequest} from '../../../../../../src/integration/kind/request/get/get-clusters-request.js';
import {type KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';

describe('GetClustersRequest', (): void => {
  let builder: KindExecutionBuilder;
  let request: GetClustersRequest;

  beforeEach((): void => {
    // Create a stub for the builder
    builder = {
      subcommands: Sinon.stub().returnsThis(),
    } as unknown as KindExecutionBuilder;

    // Create the request
    request = new GetClustersRequest();
  });

  afterEach((): void => {
    Sinon.restore();
  });

  describe('apply', (): void => {
    it('should add get clusters subcommands to the builder', (): void => {
      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('get', 'clusters');
    });
  });
});
