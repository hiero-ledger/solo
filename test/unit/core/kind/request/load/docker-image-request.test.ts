// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {LoadDockerImageRequest} from '../../../../../../src/integration/kind/request/load/docker-image-request.js';
import {type KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {type LoadDockerImageOptions} from '../../../../../../src/integration/kind/model/load-docker-image/load-docker-image-options.js';

describe('LoadDockerImageRequest', () => {
  let builder: KindExecutionBuilder;
  let request: LoadDockerImageRequest;

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
    it('should add load docker-image subcommands to the builder', () => {
      // Create request with null options
      request = new LoadDockerImageRequest(null as unknown as LoadDockerImageOptions);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('load', 'docker-image');
    });

    it('should delegate to options.apply when options are provided', () => {
      // Create mock options with a stub for apply method
      const options = {apply: Sinon.stub()} as unknown as LoadDockerImageOptions;

      // Create request with options
      request = new LoadDockerImageRequest(options);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('load', 'docker-image');

      // Verify the options.apply method was called
      expect(options.apply).to.have.been.calledOnceWith(builder);
    });
  });
});
