// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {GetKubeConfigRequest} from '../../../../../../src/integration/kind/request/get/get-kubeconfig-request.js';
import {type KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {type GetKubeConfigOptions} from '../../../../../../src/integration/kind/model/get-kubeconfig/get-kubeconfig-options.js';

describe('GetKubeConfigRequest', () => {
  let builder: KindExecutionBuilder;
  let request: GetKubeConfigRequest;

  beforeEach(() => {
    // Create a stub for the builder
    builder = {
      subcommands: Sinon.stub().returnsThis(),
    } as unknown as KindExecutionBuilder;
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe('apply', () => {
    it('should add get kubeconfig subcommands to the builder', () => {
      // Create request with null options
      request = new GetKubeConfigRequest(null as unknown as GetKubeConfigOptions);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('get', 'kubeconfig');
    });

    it('should delegate to options.apply when options are provided', () => {
      // Create mock options with a stub for apply method
      const options = {apply: Sinon.stub()} as unknown as GetKubeConfigOptions;

      // Create request with options
      request = new GetKubeConfigRequest(options);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('get', 'kubeconfig');

      // Verify the options.apply method was called
      expect(options.apply).to.have.been.calledOnceWith(builder);
    });
  });
});
