// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {LoadImageArchiveRequest} from '../../../../../../src/integration/kind/request/load/image-archive-request.js';
import {type KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {type LoadImageArchiveOptions} from '../../../../../../src/integration/kind/model/load-image-archive/load-image-archive-options.js';

describe('LoadImageArchiveRequest', () => {
  let builder: KindExecutionBuilder;
  let request: LoadImageArchiveRequest;

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
    it('should add load image-archive subcommands to the builder', () => {
      // Create request with null options
      request = new LoadImageArchiveRequest(null as unknown as LoadImageArchiveOptions);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('load', 'image-archive');
    });

    it('should delegate to options.apply when options are provided', () => {
      // Create mock options with a stub for apply method
      const options = { apply: Sinon.stub() } as unknown as LoadImageArchiveOptions;

      // Create request with options
      request = new LoadImageArchiveRequest(options);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('load', 'image-archive');

      // Verify the options.apply method was called
      expect(options.apply).to.have.been.calledOnceWith(builder);
    });
  });
});
