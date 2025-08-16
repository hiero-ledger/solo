// SPDX-License-Identifier: Apache-2.0

import {main} from '../../../../src/index.js';
import {type BaseTestOptions} from './base-test-options.js';
import {TestArgumentsBuilder} from '../../../helpers/test-arguments-builder.js';
import {InitCommand} from '../../../../src/commands/init/init.js';

export class InitTest {
  private static soloInitArgv(testName: string): string[] {
    return TestArgumentsBuilder.initialize('init', testName)
      .setCommandFlags(InitCommand.INIT_COMMAND_FLAGS)
      .setTestCacheDirectory()
      .build();
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
