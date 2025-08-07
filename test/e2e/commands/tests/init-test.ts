// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';
import {type BaseTestOptions} from './base-test-options.js';
import {InitCommand} from '../../../../src/commands/init/init.js';

export class InitTest extends BaseCommandTest {
  private static soloInitArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = InitTest;

    const argv: string[] = newArgv();
    argv.push(InitCommand.INIT_COMMAND_NAME);
    argvPushGlobalFlags(argv, testName, true);
    return argv;
  }

  public static init(options: BaseTestOptions): void {
    const {testName, testLogger} = options;
    const {soloInitArgv} = InitTest;

    it(`${testName}: solo init`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo init`);
      await main(soloInitArgv(testName));
      // TODO check that the init was successful
      testLogger.info(`${testName}: finished solo init`);
    });
  }
}
