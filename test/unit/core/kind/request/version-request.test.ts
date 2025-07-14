// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {VersionRequest} from '../../../../../src/integration/kind/request/version-request.js';
import {type KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';

describe('VersionRequest', () => {
  let builder: KindExecutionBuilder;
  let request: VersionRequest;

  beforeEach(() => {
    // Create a stub for the builder
    builder = {
      subcommands: Sinon.stub().returnsThis(),
    } as unknown as KindExecutionBuilder;

    // Create the request
    request = new VersionRequest();
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe('apply', () => {
    it('should add version subcommand to the builder', () => {
      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommand was added
      expect(builder.subcommands).to.have.been.calledOnceWith('version');
    });
  });
});
