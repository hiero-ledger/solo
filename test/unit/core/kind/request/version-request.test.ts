// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {VersionRequest} from '../../../../../src/integration/kind/request/version-request.js';
import {type KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';

describe('VersionRequest', (): void => {
  let builder: KindExecutionBuilder;
  let request: VersionRequest;

  beforeEach((): void => {
    // Create a stub for the builder
    builder = {
      subcommands: Sinon.stub().returnsThis(),
    } as unknown as KindExecutionBuilder;

    // Create the request
    request = new VersionRequest();
  });

  afterEach((): void => {
    Sinon.restore();
  });

  describe('apply', (): void => {
    it('should add version subcommand to the builder', (): void => {
      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommand was added
      expect(builder.subcommands).to.have.been.calledOnceWith('version');
    });
  });
});
