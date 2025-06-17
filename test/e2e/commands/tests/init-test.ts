// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';

export class InitTest extends BaseCommandTest {
  private soloInitArgv(): string[] {
    const {newArgv, argvPushGlobalFlags} = this;

    const argv: string[] = newArgv();
    argv.push('init');
    argvPushGlobalFlags(argv, true);
    return argv;
  }

  public init(): void {
    const {testName, testLogger} = this.options;
    const {soloInitArgv} = this;
    const soloInitArgvBound: () => string[] = soloInitArgv.bind(this);

    it(`${testName}: solo init`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo init`);
      await main(soloInitArgvBound());
      testLogger.info(`${testName}: finished solo init`);
    });
  }
}
