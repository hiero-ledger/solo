// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {ExportKubeConfigRequest} from '../../../../../../src/integration/kind/request/export/export-kubeconfig-request.js';
import {type KindExecutionBuilder} from '../../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {type ExportKubeConfigOptions} from '../../../../../../src/integration/kind/model/export-kubeconfig/export-kubeconfig-options.js';

describe('ExportKubeConfigRequest', () => {
  let builder: KindExecutionBuilder;
  let request: ExportKubeConfigRequest;

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
    it('should add export kubeconfig subcommands to the builder', () => {
      // Create request with null options
      request = new ExportKubeConfigRequest(null as unknown as ExportKubeConfigOptions);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('export', 'kubeconfig');
    });

    it('should delegate to options.apply when options are provided', () => {
      // Create mock options with a stub for apply method
      const options = {apply: Sinon.stub()} as unknown as ExportKubeConfigOptions;

      // Create request with options
      request = new ExportKubeConfigRequest(options);

      // Call the apply method
      request.apply(builder);

      // Verify the correct subcommands were added
      expect(builder.subcommands).to.have.been.calledOnceWith('export', 'kubeconfig');

      // Verify the options.apply method was called
      expect(options.apply).to.have.been.calledOnceWith(builder);
    });
  });
});
