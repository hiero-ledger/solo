// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {ErrorHandler} from '../../../src/core/error-handler.js';
import {ExitCode} from '../../../src/core/exit-code.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {SoloErrors} from '../../../src/core/errors/solo-errors.js';
import {SilentBreak} from '../../../src/core/errors/silent-break.js';
import {UserBreak} from '../../../src/core/errors/user-break.js';
import {ErrorCodeRegistry} from '../../../src/core/errors/error-code-registry.js';
import {CacheImageTemplateUnknownError} from '../../../src/integration/cache/errors/cache-image-template-unknown-error.js';
import {CacheImageTemplateUndeclaredError} from '../../../src/integration/cache/errors/cache-image-template-undeclared-error.js';

function incompatibleTuple(): SoloError {
  return new SoloErrors.validation.componentVersionIncompatible(
    ['mirror node v0.164.2 cannot run with consensus node v0.79.0'],
    ['Bump the mirror node to 0.165.0 or newer'],
  );
}

function chartInstallFailed(): SoloError {
  return new SoloErrors.component.chartInstallFailed('solo-deployment', new Error('helm exited with code 1'));
}

describe('ErrorHandler', (): void => {
  let errorHandler: ErrorHandler;
  let showUserError: SinonStub;
  let originalExitCode: number | string | undefined;

  function exitCodeFor(error: unknown): number | string | undefined {
    errorHandler.handle(error);
    return process.exitCode;
  }

  function shownErrorCode(): string | undefined {
    return (showUserError.firstCall.args[0] as SoloError).getFormattedCode();
  }

  beforeEach((): void => {
    showUserError = sinon.stub();
    const logger: SoloLogger = {
      showUser: sinon.stub(),
      showUserError,
      info: sinon.stub(),
    } as unknown as SoloLogger;
    errorHandler = new ErrorHandler(logger);
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach((): void => {
    sinon.restore();
    process.exitCode = originalExitCode;
  });

  describe('invalid input', (): void => {
    it('should exit with the invalid input code for a user-owned validation error', (): void => {
      const error: SoloError = new SoloErrors.validation.invalidFlagValue('chain-id', 'abc', 'must be a number');
      expect(exitCodeFor(error)).to.equal(ExitCode.INVALID_INPUT);
    });

    it('should exit with the invalid input code for a rejected component version tuple', (): void => {
      expect(exitCodeFor(incompatibleTuple())).to.equal(ExitCode.INVALID_INPUT);
    });

    it('should find a rejected tuple under the one-shot deploy failure that wraps it', (): void => {
      const error: SoloError = new SoloErrors.component.oneShotDeployFailed(
        'Deploy failed: Unsupported component version combination. Rollback skipped (not enabled with --rollback).',
        incompatibleTuple(),
      );
      expect(exitCodeFor(error)).to.equal(ExitCode.INVALID_INPUT);
    });

    it('should treat a validation error as the root cause when its own cause is not a Solo error', (): void => {
      const error: SoloError = new SoloErrors.validation.valuesFileParseFailed(
        'falcon-values.yaml',
        new Error('bad indentation of a mapping entry'),
      );
      expect(exitCodeFor(error)).to.equal(ExitCode.INVALID_INPUT);
    });

    it('should look past an uncoded Solo error to the validation error above it', (): void => {
      const error: SoloError = new SoloErrors.validation.flagInputFailed('namespace', new SoloError('no prompt'));
      expect(exitCodeFor(error)).to.equal(ExitCode.INVALID_INPUT);
    });
  });

  describe('failure', (): void => {
    it('should exit with the failure code for an infrastructure error', (): void => {
      expect(exitCodeFor(chartInstallFailed())).to.equal(ExitCode.FAILURE);
    });

    it('should exit with the failure code for a deploy failure that is not caused by the input', (): void => {
      const error: SoloError = new SoloErrors.component.oneShotDeployFailed(
        'Deploy failed: Error installing chart solo-deployment. Rollback skipped (not enabled with --rollback).',
        chartInstallFailed(),
      );
      expect(exitCodeFor(error)).to.equal(ExitCode.FAILURE);
    });

    it('should exit with the failure code for a validation error that the user does not own', (): void => {
      const error: SoloError = new SoloErrors.validation.unknownTemplateDependency('unknown');
      expect(exitCodeFor(error)).to.equal(ExitCode.FAILURE);
    });

    it('should exit with the failure code for a user-owned error outside the validation category', (): void => {
      const error: SoloError = new SoloErrors.deployment.notFound('Deployment missing-deployment not found');
      expect(exitCodeFor(error)).to.equal(ExitCode.FAILURE);
    });

    it('should exit with the failure code when a validation error wraps an infrastructure root cause', (): void => {
      const error: SoloError = new SoloErrors.validation.flagInputFailed('namespace', chartInstallFailed());
      expect(exitCodeFor(error)).to.equal(ExitCode.FAILURE);
    });

    it('should exit with the failure code for errors that carry no Solo error code', (): void => {
      expect(exitCodeFor(new Error('boom'))).to.equal(ExitCode.FAILURE);
      expect(exitCodeFor(new SoloError('uncoded'))).to.equal(ExitCode.FAILURE);
      expect(exitCodeFor('not an error')).to.equal(ExitCode.FAILURE);
    });
  });

  describe('translated errors', (): void => {
    it('should exit with the invalid input code when the error is shown as a user-owned validation error', (): void => {
      expect(exitCodeFor(new CacheImageTemplateUnknownError('CONSENSUS'))).to.equal(ExitCode.INVALID_INPUT);
      expect(shownErrorCode()).to.equal(ErrorCodeRegistry.CACHE_IMAGE_TEMPLATE_UNKNOWN);
    });

    it('should exit with the failure code when the error is shown as an error that is not invalid input', (): void => {
      expect(exitCodeFor(new CacheImageTemplateUndeclaredError('CONSENSUS'))).to.equal(ExitCode.FAILURE);
      expect(shownErrorCode()).to.equal(ErrorCodeRegistry.CACHE_IMAGE_TEMPLATE_UNDECLARED);
    });
  });

  describe('breaks', (): void => {
    it('should leave the exit code unset when the user aborts', (): void => {
      expect(exitCodeFor(new UserBreak('Aborted by user'))).to.be.undefined;
    });

    it('should keep the exit code a silent break was raised with', (): void => {
      process.exitCode = ExitCode.INVALID_INPUT;
      expect(exitCodeFor(new SilentBreak('Unknown argument: d'))).to.equal(ExitCode.INVALID_INPUT);
    });
  });
});
