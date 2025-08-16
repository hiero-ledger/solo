// SPDX-License-Identifier: Apache-2.0

import {ArgumentsBuilder, type FlagName} from '../../src/core/arguments-builder/arguments-builder.js';
import {Flags as flags} from '../../src/commands/flags.js';
import {getTestCacheDirectory} from '../test-utility.js';
import {type Argv} from './argv-wrapper.js';
import {type CommandFlag, type CommandFlags} from '../../src/types/flag-types.js';

export class TestArgumentsBuilder extends ArgumentsBuilder {
  private constructor(
    command: string[],
    private readonly testName?: string,
    flagArguments?: Record<FlagName, any>,
  ) {
    super(command, flagArguments);
    this.testName = testName;
  }

  public static override initialize(command: string, testName?: string): TestArgumentsBuilder {
    return new TestArgumentsBuilder(command.split(' '), testName);
  }

  public static initializeFromExisting(
    command: string,
    testName: string,
    flagArguments: Record<FlagName, any>,
  ): TestArgumentsBuilder {
    return new TestArgumentsBuilder(command.split(' '), testName, flagArguments);
  }

  public setTestCacheDirectory(): this {
    this.setArg(flags.cacheDir, getTestCacheDirectory(this.testName));
    return this;
  }

  public setChartDirectory(): this {
    if (process.env.SOLO_CHARTS_DIR && process.env.SOLO_CHARTS_DIR !== '') {
      this.setArg(flags.chartDirectory, process.env.SOLO_CHARTS_DIR);
    }
    return this;
  }

  public static initializeFromArgvMapping(
    command: string,
    commandFlags: CommandFlags,
    argv: Argv,
  ): TestArgumentsBuilder {
    const flagArguments: Record<FlagName, any> = {};

    const flagList: CommandFlag[] = [...commandFlags.optional, ...commandFlags.required];

    for (const flag of flagList) {
      const value: any = argv.getArg(flag);
      if (value !== undefined && value !== null) {
        flagArguments[flag.name] = value;
      }
    }

    return new TestArgumentsBuilder(command.split(' '), undefined, flagArguments).setCommandFlags(commandFlags);
  }
}
