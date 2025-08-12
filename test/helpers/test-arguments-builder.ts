// SPDX-License-Identifier: Apache-2.0

import {ArgumentsBuilder} from '../../src/core/arguments-builder/arguments-builder.js';
import {Flags as flags} from '../../src/commands/flags.js';
import {getTestCacheDirectory} from '../test-utility.js';

export class TestArgumentsBuilder extends ArgumentsBuilder {
  private constructor(
    argv: string[],
    private readonly testName: string,
  ) {
    super(argv);
    this.testName = testName;
  }

  public static override initialize(command: string, testName?: string): TestArgumentsBuilder {
    if (!testName) {
      throw new Error('Test name is required');
    }

    const argv: string[] = ['${PATH}/node', '${SOLO_ROOT}/solo.ts', ...command.split(' ')];
    return new TestArgumentsBuilder(argv, testName);
  }

  public static initializeFromExisting(argv: string[], testName: string): TestArgumentsBuilder {
    if (!testName) {
      throw new Error('Test name is required');
    }
    return new TestArgumentsBuilder(argv, testName);
  }

  public setTestCacheDirectory(): this {
    this.argv.push(this.optionFromFlag(flags.cacheDir), getTestCacheDirectory(this.testName));
    return this;
  }

  public setChartDirectory(): this {
    this.argv.push(this.optionFromFlag(flags.cacheDir), getTestCacheDirectory(this.testName));
    return this;
  }

  public override build(): string[] {
    this.setQuiet();
    this.setDevMode();
    return this.argv;
  }
}
