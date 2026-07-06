// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {SoloError} from '../../../src/core/errors/solo-error.js';
import {ResourceNotFoundError} from '../../../src/core/errors/classes/system/resource-not-found-error.js';
import {MissingArgumentError} from '../../../src/core/errors/classes/validation/missing-argument-error.js';
import {IllegalArgumentError} from '../../../src/core/errors/classes/validation/illegal-argument-error.js';
import {DataValidationError} from '../../../src/core/errors/classes/internal/data-validation-error.js';

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
});
