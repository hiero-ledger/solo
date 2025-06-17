// SPDX-License-Identifier: Apache-2.0

import {type CommandFlag} from '../../../../src/types/flag-types.js';
import {Flags} from '../../../../src/commands/flags.js';
import {getTestCacheDirectory} from '../../../test-utility.js';
import {type BaseCommandOptions} from './base-command-options.js';

export class BaseCommandTest {
  public constructor(public readonly options: BaseCommandOptions) {}

  protected newArgv(): string[] {
    return ['${PATH}/node', '${SOLO_ROOT}/solo.ts'];
  }

  protected optionFromFlag(flag: CommandFlag): string {
    return `--${flag.name}`;
  }

  protected argvPushGlobalFlags(
    argv: string[],
    shouldSetTestCacheDirectory: boolean = false,
    shouldSetChartDirectory: boolean = false,
  ): string[] {
    argv.push(this.optionFromFlag(Flags.devMode), this.optionFromFlag(Flags.quiet));

    if (shouldSetChartDirectory && process.env.SOLO_CHARTS_DIR && process.env.SOLO_CHARTS_DIR !== '') {
      argv.push(this.optionFromFlag(Flags.chartDirectory), process.env.SOLO_CHARTS_DIR);
    }

    if (shouldSetTestCacheDirectory) {
      argv.push(this.optionFromFlag(Flags.cacheDir), getTestCacheDirectory(this.options.testName));
    }

    return argv;
  }
}
