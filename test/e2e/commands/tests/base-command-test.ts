// SPDX-License-Identifier: Apache-2.0

import {type CommandFlag} from '../../../../src/types/flag-types.js';
import {Flags} from '../../../../src/commands/flags.js';
import {getTestCacheDirectory} from '../../../test-utility.js';

export class BaseCommandTest {
  public static newArgv(): string[] {
    return ['${PATH}/node', '${SOLO_ROOT}/solo.ts'];
  }

  public static optionFromFlag(flag: CommandFlag): string {
    return `--${flag.name}`;
  }

  public static argvPushGlobalFlags(
    argv: string[],
    testName: string,
    shouldSetTestCacheDirectory: boolean = false,
    shouldSetChartDirectory: boolean = false,
  ): string[] {
    argv.push(BaseCommandTest.optionFromFlag(Flags.devMode), BaseCommandTest.optionFromFlag(Flags.quiet));

    if (shouldSetChartDirectory && process.env.SOLO_CHARTS_DIR && process.env.SOLO_CHARTS_DIR !== '') {
      argv.push(BaseCommandTest.optionFromFlag(Flags.chartDirectory), process.env.SOLO_CHARTS_DIR);
    }

    if (shouldSetTestCacheDirectory) {
      argv.push(BaseCommandTest.optionFromFlag(Flags.cacheDir), getTestCacheDirectory(testName));
    }

    return argv;
  }
}
