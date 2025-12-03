// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';
import {accountCreationShouldSucceed} from '../../../test-utility.js';
import {it} from 'mocha';
import {type AccountManager} from '../../../../src/core/account-manager.js';
import {type RemoteConfigRuntimeState} from '../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';

export class AccountTest extends BaseCommandTest {
  public static async accountCreationShouldSucceed(options: BaseTestOptions): Promise<void> {
    const {testName, namespace, testLogger: logger} = options;

    it(`${testName}: account creation should succeed`, async (): Promise<void> => {
      const accountManager: AccountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);
      const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
        InjectTokens.RemoteConfigRuntimeState,
      );

      await remoteConfig.load(namespace);

      accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger);
    });
  }
}
