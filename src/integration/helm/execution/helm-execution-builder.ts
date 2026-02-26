// SPDX-License-Identifier: Apache-2.0

import {HelmExecution} from './helm-execution.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import * as constants from '../../../core/constants.js';

@injectable()
/**
 * A builder for creating a helm command execution.
 */
export class HelmExecutionBuilder {
  private static readonly NAME_MUST_NOT_BE_NULL: string = 'name must not be null';
  private static readonly VALUE_MUST_NOT_BE_NULL: string = 'value must not be null';

  /**
   * The path to the helm executable.
   */
  private readonly helmExecutable: string;

  /**
   * The list of subcommands to be used when execute the helm command.
   */
  private readonly _subcommands: string[] = [];

  /**
   * The arguments to be passed to the helm command.
   */
  private readonly _arguments: Map<string, string> = new Map();

  /**
   * The list of options and a list of their one or more values.
   */
  private readonly _optionsWithMultipleValues: Array<{key: string; value: string[]}> = [];

  /**
   * The flags to be passed to the helm command.
   */
  private readonly _flags: string[] = [];

  /**
   * The positional arguments to be passed to the helm command.
   */
  private readonly _positionals: string[] = [];

  /**
   * The environment variables to be set when executing the helm command.
   */
  private readonly _environmentVariables: Map<string, string> = new Map();

  /**
   * Creates a new HelmExecutionBuilder instance.
   */
  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);

    try {
      this.helmExecutable = constants.HELM;
    } catch (error) {
      this.logger?.error('Failed to find helm executable:', error);
      throw new Error('Failed to find helm executable. Please ensure helm is installed and in your PATH.');
    }
  }

  /**
   * Adds the list of subcommands to the helm execution.
   * @param commands the list of subcommands to be added
   * @returns this builder
   */
  public subcommands(...commands: string[]): HelmExecutionBuilder {
    if (!commands) {
      throw new Error('commands must not be null');
    }
    this._subcommands.push(...commands);
    return this;
  }

  /**
   * Adds an argument to the helm execution.
   * @param name the name of the argument
   * @param value the value of the argument
   * @returns this builder
   */
  public argument(name: string, value: string): HelmExecutionBuilder {
    if (!name) {
      throw new Error(HelmExecutionBuilder.NAME_MUST_NOT_BE_NULL);
    }
    if (!value) {
      throw new Error(HelmExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._arguments.set(name, value);
    return this;
  }

  /**
   * Adds an option with multiple values to the helm execution.
   * @param name the name of the option
   * @param value the list of values for the option
   * @returns this builder
   */
  public optionsWithMultipleValues(name: string, value: string[]): HelmExecutionBuilder {
    if (!name) {
      throw new Error(HelmExecutionBuilder.NAME_MUST_NOT_BE_NULL);
    }
    if (!value) {
      throw new Error(HelmExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._optionsWithMultipleValues.push({key: name, value});
    return this;
  }

  /**
   * Adds a positional argument to the helm execution.
   * @param value the value of the positional argument
   * @returns this builder
   */
  public positional(value: string): HelmExecutionBuilder {
    if (!value) {
      throw new Error(HelmExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._positionals.push(value);
    return this;
  }

  /**
   * Adds an environment variable to the helm execution.
   * @param name the name of the environment variable
   * @param value the value of the environment variable
   * @returns this builder
   */
  public environmentVariable(name: string, value: string): HelmExecutionBuilder {
    if (!name) {
      throw new Error(HelmExecutionBuilder.NAME_MUST_NOT_BE_NULL);
    }
    if (!value) {
      throw new Error(HelmExecutionBuilder.VALUE_MUST_NOT_BE_NULL);
    }
    this._environmentVariables.set(name, value);
    return this;
  }

  /**
   * Adds a flag to the helm execution.
   * @param flag the flag to be added
   * @returns this builder
   */
  public flag(flag: string): HelmExecutionBuilder {
    if (!flag) {
      throw new Error('flag must not be null');
    }
    this._flags.push(flag);
    return this;
  }

  /**
   * Builds the HelmExecution instance.
   * @returns the HelmExecution instance
   */
  public build(): HelmExecution {
    const command: string[] = this.buildCommand();
    const environment: Record<string, string> = {...process.env};
    for (const [key, value] of this._environmentVariables.entries()) {
      environment[key] = value;
    }

    return new HelmExecution(command, environment, this.logger);
  }

  /**
   * Builds the command array for the helm execution.
   * @returns the command array
   */
  private buildCommand(): string[] {
    const command: string[] = [this.helmExecutable, ...this._subcommands, ...this._flags];

    for (const [key, value] of this._arguments.entries()) {
      command.push(`--${key}`, value);
    }

    for (const entry of this._optionsWithMultipleValues) {
      for (const value of entry.value) {
        command.push(`--${entry.key}`, value);
      }
    }

    command.push(...this._positionals);

    this.logger.debug(`Helm command: helm ${command.slice(1).join(' ')}`);

    return command;
  }
}
