// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {ExportLogsRequest} from '../../../../../../src/integration/kind/request/export/export-logs-request.js';
import {type KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {type ExportLogsOptions} from '../../../../../../src/integration/kind/model/export-logs/export-logs-options.js';

describe('ExportLogsRequest', () => {
  let builder: KindExecutionBuilder;
  let request: ExportLogsRequest;

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
    it('should add export logs subcommands to the builder', () => {
      // Create request with null options
      request = new ExportLogsRequest(null as unknown as ExportLogsOptions);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('export', 'logs');
    });

    it('should delegate to options.apply when options are provided', () => {
      // Create mock options with a stub for apply method
      const options = { apply: Sinon.stub() } as unknown as ExportLogsOptions;

      // Create request with options
      request = new ExportLogsRequest(options);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('export', 'logs');

      // Verify the options.apply method was called
      expect(options.apply).to.have.been.calledOnceWith(builder);
    });
  });
});
