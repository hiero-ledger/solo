// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';

describe('KindExecutionBuilder', () => {
  let builder: KindExecutionBuilder;

  beforeEach(() => {
    // Create a fresh builder for each test
    builder = new KindExecutionBuilder();
  });

  afterEach(() => {
    // Restore all stubs
    Sinon.restore();
  });

  describe('constructor', () => {
    it('should create an instance without errors', () => {
      expect(builder).to.be.instanceOf(KindExecutionBuilder);
    });
  });

  describe('subcommands', () => {
    it('should add a subcommand', () => {
      const result = builder.subcommands('create');
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if subcommand is null', () => {
      try {
        builder.subcommands();
        expect.fail('Expected error not thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.equal('commands must not be null');
      }
    });
  });

  describe('argument', () => {
    it('should add an argument with value', () => {
      const result = builder.argument('name', 'test-cluster');
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if argument name is null', () => {
      expect(() => builder.argument(null as any, 'value')).to.throw('name must not be null');
    });

    it('should throw error if argument value is null', () => {
      expect(() => builder.argument('name', null as any)).to.throw('value must not be null');
    });
  });

  describe('flag', () => {
    it('should add a flag', () => {
      const result = builder.flag('quiet');
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if flag is null', () => {
      try {
        builder.flag(null);
        expect.fail('Expected error not thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.equal('flag must not be null');
      }
    });
  });

  describe('withPositional', () => {
    it('should add a positional argument', () => {
      const result = builder.positional('argument');
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if positional is null', () => {
      expect(() => builder.positional(null as any)).to.throw('value must not be null');
    });
  });

  describe('optionsWithMultipleValues', () => {
    it('should add an option with multiple values', () => {
      const result = builder.optionsWithMultipleValues('label', ['app=test', 'env=dev']);
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if option name is null', () => {
      expect(() => builder.optionsWithMultipleValues(null as any, ['value'])).to.throw('name must not be null');
    });

    it('should throw error if values array is null', () => {
      expect(() => builder.optionsWithMultipleValues('name', null as any)).to.throw('value must not be null');
    });
  });

  describe('environmentVariable', () => {
    it('should add an environment variable', () => {
      const result = builder.environmentVariable('DEBUG', 'true');
      expect(result).to.equal(builder); // Should return this for chaining
    });

    it('should throw error if variable name is null', () => {
      expect(() => builder.environmentVariable(null as any, 'value')).to.throw('name must not be null');
    });

    it('should throw error if variable value is null', () => {
      expect(() => builder.environmentVariable('name', null as any)).to.throw('value must not be null');
    });
  });

  describe('build', () => {
    it('should build a KindExecution with the configured parameters', () => {
      // Configure builder with various parameters
      builder
        .subcommands('create', 'cluster')
        .argument('name', 'test-cluster')
        .flag('quiet')
        .positional('--config=config.yaml')
        .optionsWithMultipleValues('label', ['app=test', 'env=dev'])
        .environmentVariable('DEBUG', 'true');

      // Build the execution
      const execution = builder.build();

      // Verify
      expect(execution).to.be.instanceOf(KindExecution);
      // More detailed verification would require inspection of private fields
      // or mocking the KindExecution constructor
    });
  });
});
