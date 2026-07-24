// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {SoloError} from '../../../src/core/errors/solo-error.js';
import {ResourceNotFoundError} from '../../../src/core/errors/classes/system/resource-not-found-error.js';
import {MissingArgumentError} from '../../../src/core/errors/classes/validation/missing-argument-error.js';
import {IllegalArgumentError} from '../../../src/core/errors/classes/validation/illegal-argument-error.js';
import {DataValidationError} from '../../../src/core/errors/classes/internal/data-validation-error.js';
import {SdkPingFailedSoloError} from '../../../src/core/errors/classes/component/sdk-ping-failed-solo-error.js';
import {SdkClientNoHealthyNodesSoloError} from '../../../src/core/errors/classes/component/sdk-client-no-healthy-nodes-solo-error.js';
import {SdkErrorTranslator} from '../../../src/core/errors/sdk-error-translator.js';

describe('Errors', (): void => {
  const message: string = 'errorMessage';
  const cause: Error = new Error('cause');

  it('should construct correct SoloError', (): void => {
    const error: SoloError = new SoloError(message, cause);
    expect(error).to.be.instanceof(Error);
    expect(error.name).to.equal('SoloError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal(cause);
    expect(error.meta).to.deep.equal({});
  });

  it('should construct correct ResourceNotFoundError', (): void => {
    const resource: string = 'resource';
    const error: ResourceNotFoundError = new ResourceNotFoundError(resource);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('ResourceNotFoundError');
    expect(error.message).to.equal(`Resource not found: ${resource}`);
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({resource});
  });

  it('should construct correct MissingArgumentError', (): void => {
    const error: MissingArgumentError = new MissingArgumentError(message);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('MissingArgumentError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({});
  });

  it('should construct correct IllegalArgumentError', (): void => {
    const value: string = 'invalid argument';
    const error: IllegalArgumentError = new IllegalArgumentError(message, value);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('IllegalArgumentError');
    expect(error.message).to.equal(message);
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({value});
  });

  it('should construct correct DataValidationError', (): void => {
    const context: string = 'errorMessage';
    const expected: string = 'expected';
    const found: string = 'found';
    const error: DataValidationError = new DataValidationError(context, expected, found);
    expect(error).to.be.instanceof(SoloError);
    expect(error.name).to.equal('DataValidationError');
    expect(error.message).to.equal(
      `Data validation failed: ${context} (expected: ${JSON.stringify(expected)}, found: ${JSON.stringify(found)})`,
    );
    expect(error.cause).to.deep.equal({});
    expect(error.meta).to.deep.equal({expected, found});
  });

  it('should include the last consensus node platform status in SdkPingFailedSoloError', (): void => {
    const error: SdkPingFailedSoloError = new SdkPingFailedSoloError('127.0.0.1:30213', 5, cause, 'STARTING_UP');
    expect(error).to.be.instanceof(SoloError);
    expect(error.message).to.equal(
      'SDK ping to network node 127.0.0.1:30213 failed after 5 retries; last consensus node platform status: STARTING_UP',
    );
  });

  it('should translate the raw SDK "failed to find a healthy working node" error', (): void => {
    const sdkError: Error = new Error('failed to find a healthy working node');
    const translated: SoloError | undefined = SdkErrorTranslator.tryTranslate(sdkError);
    expect(translated).to.be.instanceof(SdkClientNoHealthyNodesSoloError);
    expect(translated.message).to.not.include('healthy working node');
    expect(translated.message).to.include('may still be ACTIVE');
    expect(translated.cause).to.equal(sdkError);
  });

  it('should translate the SDK error when buried in a cause chain', (): void => {
    const wrapped: SoloError = new SoloError(
      'relay deploy failed',
      new SoloError('account creation failed', new Error('failed to find a healthy working node')),
    );
    const translated: SoloError | undefined = SdkErrorTranslator.tryTranslate(wrapped);
    expect(translated).to.be.instanceof(SdkClientNoHealthyNodesSoloError);
    expect(translated.cause).to.equal(wrapped);
  });

  it('should not translate unrelated errors', (): void => {
    expect(SdkErrorTranslator.tryTranslate(new Error('something else'))).to.equal(undefined);
    expect(SdkErrorTranslator.tryTranslate('not an error')).to.equal(undefined);
  });
});
