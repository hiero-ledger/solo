// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';
import {type BaseCommandOptions} from './base-command-options.js';

export class InitTest extends BaseCommandTest {
  private static soloInitArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = InitTest;

    const argv: string[] = newArgv();
    argv.push('init');
    argvPushGlobalFlags(argv, testName, true);
    return argv;
  }

  public static init(options: BaseCommandOptions): void {
    const {testName, testLogger} = options;
    const {soloInitArgv} = InitTest;

    it(`${testName}: solo init`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo init`);
      await main(soloInitArgv(testName));
      testLogger.info(`${testName}: finished solo init`);
    });
  }
}
