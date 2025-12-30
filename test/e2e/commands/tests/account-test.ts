// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';
import {accountCreationShouldSucceed} from '../../../test-utility.js';
import {after, before, describe, it} from 'mocha';
import {type AccountManager} from '../../../../src/core/account-manager.js';
import {type RemoteConfigRuntimeState} from '../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {main} from '../../../../src/index.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type DeploymentName} from '../../../../src/types/index.js';
import {Flags as flags, Flags} from '../../../../src/commands/flags.js';
import {LedgerCommandDefinition} from '../../../../src/commands/command-definitions/ledger-command-definition.js';
import {type Key, PrivateKey} from '@hiero-ledger/sdk';
import * as constants from '../../../../src/core/constants.js';
import {type Secret} from '../../../../src/integration/kube/resources/secret/secret.js';
import {Templates} from '../../../../src/core/templates.js';
import * as Base64 from 'js-base64';
import {expect} from 'chai';
import {entityId} from '../../../../src/core/helpers.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type AccountCommand} from '../../../../src/commands/account.js';

export type AccountInfoData = {
  accountId: string;
  balance: number;
  publicKey: string;
  privateKey?: string;
  accountAlias?: string;
};

export class AccountTest extends BaseCommandTest {
  public static accountCreationShouldSucceed(options: BaseTestOptions): void {
    const {testName, namespace, testLogger: logger} = options;

    it(`${testName}: account creation should succeed`, async (): Promise<void> => {
      const accountManager: AccountManager = container.resolve(InjectTokens.AccountManager);
      const remoteConfig: RemoteConfigRuntimeState = container.resolve(InjectTokens.RemoteConfigRuntimeState);

      await remoteConfig.load(namespace);

      accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger);
    });
  }

  // ----- Commands ----- //

  // Init Command
  public static init(options: BaseTestOptions): void {
    const {testName, deployment} = options;

    it(`${testName}: ledger system init`, async (): Promise<void> => {
      await main(AccountTest.ledgerSystemInitArgv(deployment));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  private static ledgerSystemInitArgv(deployment: DeploymentName): string[] {
    const {newArgv, optionFromFlag} = AccountTest;

    const argv: string[] = newArgv();
    argv.push(
      LedgerCommandDefinition.COMMAND_NAME,
      LedgerCommandDefinition.SYSTEM_SUBCOMMAND_NAME,
      LedgerCommandDefinition.SYSTEM_INIT,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    return argv;
  }

  // Create Command
  public static create(
    options: BaseTestOptions,
    ed25519PrivateKey?: string,
    amount?: number,
    ecdsaPrivateKey?: string,
  ): void {
    const {testName, deployment} = options;

    it(`${testName}: ledger account create`, async (): Promise<void> => {
      await main(AccountTest.ledgerAccountCreateArgv(deployment, ed25519PrivateKey, amount, ecdsaPrivateKey));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  private static ledgerAccountCreateArgv(
    deployment: DeploymentName,
    ed25519PrivateKey?: string,
    amount?: number,
    ecdsaPrivateKey?: string,
  ): string[] {
    const {newArgv, optionFromFlag} = AccountTest;

    const argv: string[] = newArgv();
    argv.push(
      LedgerCommandDefinition.COMMAND_NAME,
      LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
      LedgerCommandDefinition.ACCOUNT_CREATE,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    if (ed25519PrivateKey) {
      argv.push(optionFromFlag(flags.ed25519PrivateKey), ed25519PrivateKey);
    } else if (ecdsaPrivateKey) {
      argv.push(optionFromFlag(flags.ecdsaPrivateKey), ecdsaPrivateKey, optionFromFlag(flags.setAlias));
    }

    if (typeof amount === 'number') {
      argv.push(optionFromFlag(flags.amount), amount.toString());
    }

    return argv;
  }

  // Update Command
  public static update(options: BaseTestOptions, accountId: string, amount?: number, ed25519PrivateKey?: string): void {
    const {testName, deployment} = options;

    it(`${testName}: ledger account update`, async (): Promise<void> => {
      await main(AccountTest.ledgerAccountUpdateArgv(deployment, accountId, amount, ed25519PrivateKey));

      // @ts-expect-error - to access private property
      const accountInfo: AccountInfoData = container.resolve<AccountCommand>(InjectTokens.AccountCommand).accountInfo;
      expect(accountInfo).not.to.be.null;
      expect(accountInfo.accountId).to.equal(accountId);
      expect(accountInfo.privateKey).to.be.undefined;
      expect(accountInfo.publicKey).not.to.be.null;
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  private static ledgerAccountUpdateArgv(
    deployment: DeploymentName,
    accountId: string,
    amount?: number,
    ed25519PrivateKey?: string,
  ): string[] {
    const {newArgv, optionFromFlag} = AccountTest;

    const argv: string[] = newArgv();
    argv.push(
      LedgerCommandDefinition.COMMAND_NAME,
      LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
      LedgerCommandDefinition.ACCOUNT_UPDATE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.accountId),
      accountId,
      optionFromFlag(flags.amount),
      typeof amount === 'number' ? amount.toString() : '0',
    );

    if (ed25519PrivateKey) {
      argv.push(optionFromFlag(flags.ed25519PrivateKey), ed25519PrivateKey);
    }

    return argv;
  }

  // Info Command
  public static info(options: BaseTestOptions, accountId: string): void {
    const {testName, deployment} = options;

    it(`${testName}: ledger account info`, async (): Promise<void> => {
      await main(AccountTest.ledgerAccountInfoArgv(deployment, accountId));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  private static ledgerAccountInfoArgv(deployment: DeploymentName, accountId: string): string[] {
    const {newArgv, optionFromFlag} = AccountTest;

    const argv: string[] = newArgv();
    argv.push(
      LedgerCommandDefinition.COMMAND_NAME,
      LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
      LedgerCommandDefinition.ACCOUNT_INFO,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.accountId),
      accountId,
    );

    return argv;
  }

  // ----- Tests ------
  public static specialAccountsShouldHaveNewKeys(options: BaseTestOptions): void {
    describe('special accounts should have new keys', (): void => {
      const {realm, shard, namespace, deployment, testLogger: logger, consensusNodesCount} = options;

      const accountManager: AccountManager = container.resolve(InjectTokens.AccountManager);
      const remoteConfig: RemoteConfigRuntimeState = container.resolve(InjectTokens.RemoteConfigRuntimeState);
      const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);

      // Static test data
      const genesisKey: PrivateKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
      const testSystemAccounts: number[][] = [[3, 5]];

      before(async function (): Promise<void> {
        this.timeout(Duration.ofSeconds(20).toMillis());

        await accountManager.loadNodeClient(namespace, remoteConfig.getClusterRefs(), deployment, true);
      });

      after(async function (): Promise<void> {
        this.timeout(Duration.ofSeconds(20).toMillis());
        await accountManager.close();
      });

      it('Node admin key should have been updated, not equal to genesis key', async (): Promise<void> => {
        for (const nodeAlias of Templates.renderNodeAliasesFromCount(consensusNodesCount, 0)) {
          const keyFromK8: Secret = await k8Factory
            .default()
            .secrets()
            .read(namespace, Templates.renderNodeAdminKeyName(nodeAlias));

          const privateKey: string = Base64.decode(keyFromK8.data.privateKey);

          expect(privateKey.toString()).not.to.equal(genesisKey.toString());
        }
      });

      for (const [start, end] of testSystemAccounts) {
        for (let index: number = start; index <= end; index++) {
          it(`account ${index} should not have genesis key`, async (): Promise<void> => {
            expect(accountManager._nodeClient).not.to.be.null;

            const accountId: string = entityId(shard, realm, index);
            logger.info(`Fetching account keys: accountId ${accountId}`);
            const keys: Key[] = await accountManager.getAccountKeys(accountId);
            logger.info(`Fetched account keys: accountId ${accountId}`);

            expect(keys.length).not.to.equal(0);
            expect(keys[0].toString()).not.to.equal(genesisKey.toString());
          }).timeout(Duration.ofSeconds(20).toMillis());
        }
      }
    });
  }

  public static validateAccountInfo(privateKey?: string, amount?: number): string {
    // @ts-expect-error - to access private property
    const accountInfo: AccountInfoData = container.resolve<AccountCommand>(InjectTokens.AccountCommand).accountInfo;

    expect(accountInfo).not.to.be.null;
    expect(accountInfo.accountId).not.to.be.null;
    expect(accountInfo.privateKey).not.to.be.null;
    expect(accountInfo.publicKey).not.to.be.null;

    if (privateKey) {
      expect(accountInfo.privateKey.toString()).to.equal(privateKey);
    }

    if (typeof amount === 'number') {
      expect(accountInfo.balance).to.equal(amount);
    }

    return accountInfo.accountId;
  }
}
