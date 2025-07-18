// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {BuildNodeImagesRequest} from '../../../../../../src/integration/kind/request/build/build-node-images-request.js';
import {type KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {type BuildNodeImagesOptions} from '../../../../../../src/integration/kind/model/build-node-images/build-node-images-options.js';

describe('BuildNodeImagesRequest', () => {
  let builder: KindExecutionBuilder;
  let request: BuildNodeImagesRequest;

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
    it('should add build node-image subcommands to the builder', () => {
      // Create request with null options
      request = new BuildNodeImagesRequest(null as unknown as BuildNodeImagesOptions);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('build', 'node-image');
    });

    it('should delegate to options.apply when options are provided', () => {
      // Create mock options with a stub for apply method
      const options = {apply: Sinon.stub()} as unknown as BuildNodeImagesOptions;

      // Create request with options
      request = new BuildNodeImagesRequest(options);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('build', 'node-image');

      // Verify the options.apply method was called
      expect(options.apply).to.have.been.calledOnceWith(builder);
    });
  });
});
