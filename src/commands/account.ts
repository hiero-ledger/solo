// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {BaseCommand} from './base.js';
import {IllegalArgumentError} from '../core/errors/illegal-argument-error.js';
import {SoloError} from '../core/errors/solo-error.js';
import {Flags as flags} from './flags.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import * as helpers from '../core/helpers.js';
import {entityId} from '../core/helpers.js';
import {type AccountManager} from '../core/account-manager.js';
import {
  AccountId,
  AccountInfo,
  Hbar,
  HbarUnit,
  Long,
  NodeUpdateTransaction,
  PrivateKey,
  TransactionReceipt,
  TransactionResponse,
} from '@hiero-ledger/sdk';
import {type ArgvStruct, type NodeAliases, NodeId} from '../types/aliases.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {
  type ClusterReferenceName,
  type DeploymentName,
  type Realm,
  type Shard,
  type SoloListr,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {Templates} from '../core/templates.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {Base64} from 'js-base64';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {CommandFlags} from '../types/flag-types.js';
import {Duration} from '../core/time/duration.js';
import {
  type CreatedPredefinedAccount,
  type PredefinedAccount,
  PREDEFINED_ACCOUNT_GROUPS,
  predefinedEcdsaAccounts,
  predefinedEcdsaAccountsWithAlias,
  predefinedEd25519Accounts,
  type SystemAccount,
} from './one-shot/predefined-accounts.js';

interface UpdateAccountConfig {
  accountId: string;
  amount: number;
  namespace: NamespaceName;
  deployment: DeploymentName;
  ecdsaPrivateKey: string;
  ed25519PrivateKey: string;
  clusterRef: ClusterReferenceName;
  contextName: string;
}

interface UpdateAccountContext {
  config: UpdateAccountConfig;
  accountInfo: {accountId: AccountId | string; balance: number; publicKey: string; privateKey?: string};
}

@injectable()
export class AccountCommand extends BaseCommand {
  private static ACCOUNT_KEY_USER_MESSAGE: string =
    'where:\n' +
    '- privateKey: the hex-encoded private key which is used to sign transactions with in the Hiero SDKs\n' +
    '- privateKeyRaw: the Ethereum compatible private key, without the `0x` prefix\n' +
    '- for more information see: https://docs.hedera.com/hedera/core-concepts/keys-and-signatures';

  private accountInfo: {
    accountId: string;
    balance: number;
    publicKey: string;
    privateKey?: string;
    accountAlias?: string;
  } | null;

  public constructor(
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.SystemAccounts) private readonly systemAccounts: number[][],
  ) {
    super();

    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.accountInfo = null;
    this.systemAccounts = patchInject(systemAccounts, InjectTokens.SystemAccounts, this.constructor.name);
  }

  public static INIT_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.nodeAliasesUnparsed, flags.clusterRef],
  };

  public static CREATE_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.amount,
      flags.createAmount,
      flags.ecdsaPrivateKey,
      flags.privateKey,
      flags.ed25519PrivateKey,
      flags.generateEcdsaKey,
      flags.setAlias,
      flags.clusterRef,
    ],
  };

  public static UPDATE_FLAGS_LIST: CommandFlags = {
    required: [flags.accountId, flags.deployment],
    optional: [flags.amount, flags.ecdsaPrivateKey, flags.ed25519PrivateKey, flags.clusterRef],
  };

  public static GET_FLAGS_LIST: CommandFlags = {
    required: [flags.accountId, flags.deployment],
    optional: [flags.privateKey, flags.clusterRef],
  };

  public static PREDEFINED_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.clusterRef, flags.forcePortForward],
  };

  private async closeConnections(): Promise<void> {
    await this.accountManager.close();
  }

  private async buildAccountInfo(
    accountInfo: AccountInfo,
    namespace: NamespaceName,
    shouldRetrievePrivateKey: boolean,
  ): Promise<{accountId: string; balance: number; publicKey: string; privateKey?: string; privateKeyRaw?: string}> {
    if (!accountInfo || !(accountInfo instanceof AccountInfo)) {
      throw new IllegalArgumentError('An instance of AccountInfo is required');
    }

    const newAccountInfo: {
      accountId: string;
      balance: number;
      publicKey: string;
      privateKey?: string;
      privateKeyRaw?: string;
    } = {
      accountId: accountInfo.accountId.toString(),
      publicKey: accountInfo.key.toString(),
      balance: accountInfo.balance.to(HbarUnit.Hbar).toNumber(),
    };

    if (shouldRetrievePrivateKey) {
      const accountKeys = await this.accountManager.getAccountKeysFromSecret(newAccountInfo.accountId, namespace);
      newAccountInfo.privateKey = accountKeys.privateKey;

      // reconstruct private key to retrieve EVM address if private key is ECDSA type
      try {
        const privateKey = PrivateKey.fromStringDer(newAccountInfo.privateKey);
        newAccountInfo.privateKeyRaw = privateKey.toStringRaw();
      } catch {
        throw new SoloError(`failed to retrieve EVM address for accountId ${newAccountInfo.accountId}`);
      }
    }

    return newAccountInfo;
  }

  public async createNewAccount(context_: {
    config: {
      generateEcdsaKey: boolean;
      ecdsaPrivateKey?: string;
      ed25519PrivateKey?: string;
      namespace: NamespaceName;
      setAlias: boolean;
      amount: number;
      contextName: string;
    };
    privateKey: PrivateKey;
  }): Promise<{accountId: string; privateKey: string; publicKey: string; balance: number; accountAlias?: string}> {
    if (context_.config.ecdsaPrivateKey) {
      context_.privateKey = PrivateKey.fromStringECDSA(context_.config.ecdsaPrivateKey);
    } else if (context_.config.ed25519PrivateKey) {
      context_.privateKey = PrivateKey.fromStringED25519(context_.config.ed25519PrivateKey);
    } else if (context_.config.generateEcdsaKey) {
      context_.privateKey = PrivateKey.generateECDSA();
    } else {
      context_.privateKey = PrivateKey.generateED25519();
    }

    return await this.accountManager.createNewAccount(
      context_.config.namespace,
      context_.privateKey,
      context_.config.amount,
      context_.config.ecdsaPrivateKey || context_.config.generateEcdsaKey ? context_.config.setAlias : false,
      context_.config.contextName,
    );
  }

  private getAccountInfo(context_: {config: {accountId: string}}): Promise<AccountInfo> {
    return this.accountManager.accountInfoQuery(context_.config.accountId);
  }

  private async updateAccountInfo(context_: UpdateAccountContext): Promise<boolean> {
    let amount = context_.config.amount;
    if (context_.config.ed25519PrivateKey) {
      if (
        !(await this.accountManager.sendAccountKeyUpdate(
          context_.accountInfo.accountId,
          context_.config.ed25519PrivateKey,
          context_.accountInfo.privateKey,
        ))
      ) {
        throw new SoloError(`failed to update account keys for accountId ${context_.accountInfo.accountId}`);
      }
    } else {
      amount = amount || (flags.amount.definition.defaultValue as number);
    }

    const hbarAmount = Number.parseFloat(amount.toString());
    if (amount && Number.isNaN(hbarAmount)) {
      throw new SoloError(`The HBAR amount was invalid: ${amount}`);
    }

    if (hbarAmount > 0) {
      const deployment: DeploymentName = context_.config.deployment;
      if (!(await this.transferAmountFromOperator(context_.accountInfo.accountId, hbarAmount, deployment))) {
        throw new SoloError(`failed to transfer amount for accountId ${context_.accountInfo.accountId}`);
      }
      this.logger.debug(`sent transfer amount for account ${context_.accountInfo.accountId}`);
    }
    return true;
  }

  private async transferAmountFromOperator(
    toAccountId: AccountId | string,
    amount: number,
    deploymentName: DeploymentName,
  ): Promise<boolean> {
    const operatorAccountId = this.accountManager.getOperatorAccountId(deploymentName);
    return await this.accountManager.transferAmount(operatorAccountId, toAccountId, amount);
  }

  public async init(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      namespace: NamespaceName;
      nodeAliases: NodeAliases;
      clusterRef: ClusterReferenceName;
      deployment: DeploymentName;
      contextName: string;
    }

    interface Context {
      config: Config;
      updateSecrets: boolean;
      accountsBatchedSet: number[][];
      resultTracker: {
        rejectedCount: number;
        fulfilledCount: number;
        skippedCount: number;
      };
    }

    const tasks: Listr<Context, any, any> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_: Context, task: SoloListrTaskWrapper<Context>): Promise<void> => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);

            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const clusterReference: ClusterReferenceName = this.getClusterReference();
            const contextName: string = this.getClusterContext(clusterReference);

            const config: Config = {
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              clusterRef: clusterReference,
              contextName,
              namespace: await this.resolveNamespaceFromDeployment(task),
              nodeAliases: helpers.parseNodeAliases(
                this.configManager.getFlag(flags.nodeAliasesUnparsed),
                this.remoteConfig.getConsensusNodes(),
                this.configManager,
              ),
            };

            await this.throwIfNamespaceIsMissing(config.contextName, config.namespace);

            // set config in the context for later tasks to use
            context_.config = config;

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfig.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'Update special account keys',
          task: (_, task): SoloListr<Context> => {
            return new Listr(
              [
                {
                  title: 'Prepare for account key updates',
                  task: async (context_: Context): Promise<void> => {
                    const config: Config = context_.config;

                    context_.updateSecrets = await self.k8Factory
                      .getK8(config.clusterRef)
                      .secrets()
                      .list(config.namespace, ['solo.hedera.com/account-id'])
                      .then((secrets): boolean => secrets.length > 0);

                    context_.accountsBatchedSet = self.accountManager.batchAccounts(this.systemAccounts);

                    context_.resultTracker = {
                      rejectedCount: 0,
                      fulfilledCount: 0,
                      skippedCount: 0,
                    };

                    // do a write transaction to trigger the handler and generate the system accounts to complete genesis
                    const deployment: DeploymentName = config.deployment;
                    const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deployment);
                    const freezeAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);
                    await self.accountManager.transferAmount(treasuryAccountId, freezeAccountId, 1);
                  },
                },
                {
                  title: 'Update special account key sets',
                  task: (context_: Context): SoloListr<Context> => {
                    const config: Config = context_.config;

                    const subTasks: SoloListrTask<Context>[] = [];
                    const realm: Realm = this.localConfig.configuration.realmForDeployment(config.deployment);
                    const shard: Shard = this.localConfig.configuration.shardForDeployment(config.deployment);

                    for (const currentSet of context_.accountsBatchedSet) {
                      const accountStart: string = entityId(shard, realm, currentSet[0]);
                      const accountEnd: string = entityId(shard, realm, currentSet.at(-1));
                      const rangeString: string =
                        accountStart === accountEnd
                          ? `${chalk.yellow(accountStart)}`
                          : `${chalk.yellow(accountStart)} to ${chalk.yellow(accountEnd)}`;

                      subTasks.push({
                        title: `Updating accounts [${rangeString}]`,
                        task: async (context_: Context): Promise<void> => {
                          const config: Config = context_.config;

                          context_.resultTracker = await self.accountManager.updateSpecialAccountsKeys(
                            config.namespace,
                            currentSet,
                            context_.updateSecrets,
                            context_.resultTracker,
                            config.deployment,
                          );
                        },
                      });
                    }

                    // set up the sub-tasks
                    return task.newListr(subTasks, {
                      concurrent: false,
                      rendererOptions: {
                        collapseSubtasks: false,
                      },
                    });
                  },
                },
                {
                  title: 'Update node admin key',
                  task: async ({config}: Context): Promise<void> => {
                    const adminKey: PrivateKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);

                    for (const nodeAlias of config.nodeAliases) {
                      const nodeId: NodeId = Templates.nodeIdFromNodeAlias(nodeAlias);
                      const nodeClient = await self.accountManager.refreshNodeClient(
                        config.namespace,
                        self.remoteConfig.getClusterRefs(),
                        nodeAlias,
                        config.deployment,
                      );

                      try {
                        let nodeUpdateTx: NodeUpdateTransaction = new NodeUpdateTransaction().setNodeId(
                          new Long(nodeId),
                        );

                        const newPrivateKey: PrivateKey = PrivateKey.generateED25519();

                        nodeUpdateTx = nodeUpdateTx.setAdminKey(newPrivateKey.publicKey);
                        nodeUpdateTx = nodeUpdateTx.freezeWith(nodeClient);
                        nodeUpdateTx = await nodeUpdateTx.sign(newPrivateKey);
                        const signedTx: NodeUpdateTransaction = await nodeUpdateTx.sign(adminKey);
                        const txResp: TransactionResponse = await signedTx.execute(nodeClient);
                        const nodeUpdateReceipt: TransactionReceipt = await txResp.getReceipt(nodeClient);

                        self.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()} for node ${nodeAlias}`);

                        // save new key in k8s secret
                        const data: {privateKey: string; publicKey: string} = {
                          privateKey: Base64.encode(newPrivateKey.toString()),
                          publicKey: Base64.encode(newPrivateKey.publicKey.toString()),
                        };
                        await this.k8Factory
                          .getK8(config.contextName)
                          .secrets()
                          .create(
                            config.namespace,
                            Templates.renderNodeAdminKeyName(nodeAlias),
                            SecretType.OPAQUE,
                            data,
                            {'solo.hedera.com/node-admin-key': 'true'},
                          );
                      } catch (error) {
                        throw new SoloError(`Error updating admin key for node ${nodeAlias}: ${error.message}`, error);
                      }
                    }
                  },
                },
                {
                  title: 'Display results',
                  task: ({resultTracker: {fulfilledCount, skippedCount, rejectedCount}}: Context): void => {
                    self.logger.showUser(chalk.green(`Account keys updated SUCCESSFULLY: ${fulfilledCount}`));

                    if (skippedCount > 0) {
                      self.logger.showUser(chalk.cyan(`Account keys updates SKIPPED: ${skippedCount}`));
                    }

                    if (rejectedCount > 0) {
                      self.logger.showUser(chalk.yellowBright(`Account keys updates with ERROR: ${rejectedCount}`));
                    }

                    self.logger.showUser(chalk.gray('Waiting for sockets to be closed....'));

                    if (rejectedCount > 0) {
                      throw new SoloError(`Account keys updates failed for ${rejectedCount} accounts.`);
                    }
                  },
                },
              ],
              {
                concurrent: false,
                rendererOptions: {
                  collapseSubtasks: false,
                },
              },
            );
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error in creating account: ${error.message}`, error);
    } finally {
      await this.closeConnections();
      // create two accounts to force the handler to trigger
      await self.create(argv);
      await self.create(argv);
    }

    return true;
  }

  public async create(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      amount: number;
      ecdsaPrivateKey: string;
      ed25519PrivateKey: string;
      namespace: NamespaceName;
      privateKey: boolean;
      deployment: DeploymentName;
      setAlias: boolean;
      generateEcdsaKey: boolean;
      createAmount: number;
      contextName: string;
      clusterRef: ClusterReferenceName;
    }

    interface Context {
      config: Config;
      privateKey: PrivateKey;
    }

    const tasks: Listr<Context, any, any> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);

            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const config: Config = {
              amount: self.configManager.getFlag(flags.amount),
              ecdsaPrivateKey: self.configManager.getFlag(flags.ecdsaPrivateKey),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: self.configManager.getFlag(flags.deployment),
              ed25519PrivateKey: self.configManager.getFlag(flags.ed25519PrivateKey),
              setAlias: self.configManager.getFlag(flags.setAlias),
              generateEcdsaKey: self.configManager.getFlag(flags.generateEcdsaKey),
              privateKey: self.configManager.getFlag(flags.privateKey),
              createAmount: self.configManager.getFlag(flags.createAmount),
              clusterRef: self.configManager.getFlag(flags.clusterRef),
            } as Config;

            config.contextName =
              this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString() ??
              self.k8Factory.default().contexts().readCurrent();

            if (!config.amount) {
              config.amount = flags.amount.definition.defaultValue as number;
            }

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            context_.config = config;

            await self.accountManager.loadNodeClient(
              context_.config.namespace,
              self.remoteConfig.getClusterRefs(),
              config.deployment,
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'create the new account',
          task: async (context_, task) => {
            const subTasks: SoloListrTask<Context>[] = [];

            for (let index = 0; index < context_.config.createAmount; index++) {
              subTasks.push({
                title: `Create accounts [${index}]`,
                task: async (context_: Context) => {
                  self.accountInfo = await self.createNewAccount(context_);
                  const accountInfoCopy = {...self.accountInfo};
                  if (!context_.config.privateKey) {
                    delete accountInfoCopy.privateKey;
                  }
                  this.logger.showJSON('new account created', accountInfoCopy);
                  if (context_.config.privateKey) {
                    this.logger.showUser(AccountCommand.ACCOUNT_KEY_USER_MESSAGE);
                  }
                },
              });
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: 8,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error in creating account: ${error.message}`, error);
    } finally {
      await this.closeConnections();
    }

    return true;
  }

  public async update(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    const tasks: Listr<UpdateAccountContext, any, any> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);

            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            await self.configManager.executePrompt(task, [flags.accountId]);

            const config = {
              accountId: self.configManager.getFlag(flags.accountId),
              amount: self.configManager.getFlag<number>(flags.amount),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              ecdsaPrivateKey: self.configManager.getFlag(flags.ecdsaPrivateKey),
              ed25519PrivateKey: self.configManager.getFlag(flags.ed25519PrivateKey),
              clusterRef: self.configManager.getFlag<ClusterReferenceName>(flags.clusterRef),
            } as UpdateAccountConfig;

            config.contextName =
              this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString() ??
              self.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            context_.config = config;

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfig.getClusterRefs(),
              config.deployment,
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'get the account info',
          task: async context_ => {
            context_.accountInfo = await self.buildAccountInfo(
              await self.getAccountInfo(context_),
              context_.config.namespace,
              !!context_.config.ed25519PrivateKey,
            );
          },
        },
        {
          title: 'update the account',
          task: async context_ => {
            if (!(await self.updateAccountInfo(context_))) {
              throw new SoloError(`An error occurred updating account ${context_.accountInfo.accountId}`);
            }
          },
        },
        {
          title: 'get the updated account info',
          task: async context_ => {
            self.accountInfo = await self.buildAccountInfo(
              await self.getAccountInfo(context_),
              context_.config.namespace,
              false,
            );
            this.logger.showJSON('account info', self.accountInfo);
            this.logger.showUser(AccountCommand.ACCOUNT_KEY_USER_MESSAGE);
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error in updating account: ${error.message}`, error);
    } finally {
      await this.closeConnections();
    }

    return true;
  }

  public async createPredefined(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      namespace: NamespaceName;
      deployment: DeploymentName;
      contextName: string;
      clusterRef: ClusterReferenceName;
    }

    interface Context {
      config: Config;
      createdAccounts: CreatedPredefinedAccount[];
    }

    const tasks: Listr<Context, any, any> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);

            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const config: Config = {
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: self.configManager.getFlag(flags.deployment),
              clusterRef: self.configManager.getFlag(flags.clusterRef),
              contextName: '',
            };

            config.contextName =
              this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString() ??
              self.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            context_.config = config;
            context_.createdAccounts = [];

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfig.getClusterRefs(),
              config.deployment,
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'Create predefined accounts',
          task: async (context_, task): Promise<Listr<Context>> => {
            const subTasks: SoloListrTask<Context>[] = [];
            const accountsToCreate: PredefinedAccount[] = [
              ...predefinedEcdsaAccounts,
              ...predefinedEcdsaAccountsWithAlias,
              ...predefinedEd25519Accounts,
            ];

            for (const [index, account] of accountsToCreate.entries()) {
              ((index: number, account: PredefinedAccount) => {
                subTasks.push({
                  title: `Creating Account ${index}`,
                  task: async (context_: Context, subTask: SoloListrTaskWrapper<Context>): Promise<void> => {
                    await helpers.sleep(Duration.ofMillis(100 * index));
                    const balance = account.balance ?? Hbar.from(0, HbarUnit.Hbar);
                    const createdAccount = await self.accountManager.createNewAccount(
                      context_.config.namespace,
                      account.privateKey,
                      balance.to(HbarUnit.Hbar).toNumber(),
                      account.alias,
                      context_.config.contextName,
                    );

                    context_.createdAccounts.push({
                      accountId: AccountId.fromString(createdAccount.accountId),
                      data: account,
                      alias: createdAccount.accountAlias,
                      publicKey: createdAccount.publicKey,
                    });

                    subTask.title = `Account created: ${createdAccount.accountId.toString()}`;
                  },
                });
              })(index, account);
            }

            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        {
          title: 'Show accounts',
          task: async (context_: Context): Promise<void> => {
            self.showPredefinedAccounts(context_.createdAccounts, context_.config.deployment);
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error in creating predefined accounts: ${error.message}`, error);
    } finally {
      await this.closeConnections();
    }

    return true;
  }

  private showPredefinedAccounts(createdAccounts: CreatedPredefinedAccount[] = [], deployment: DeploymentName): void {
    if (createdAccounts.length === 0) {
      return;
    }

    createdAccounts.sort((a: CreatedPredefinedAccount, b: CreatedPredefinedAccount): number =>
      a.accountId.compare(b.accountId),
    );

    const ecdsaAccounts: CreatedPredefinedAccount[] = createdAccounts.filter(
      (account: CreatedPredefinedAccount): boolean => account.data.group === PREDEFINED_ACCOUNT_GROUPS.ECDSA,
    );
    const aliasAccounts: CreatedPredefinedAccount[] = createdAccounts.filter(
      (account: CreatedPredefinedAccount): boolean => account.data.group === PREDEFINED_ACCOUNT_GROUPS.ECDSA_ALIAS,
    );
    const ed25519Accounts: CreatedPredefinedAccount[] = createdAccounts.filter(
      (account: CreatedPredefinedAccount): boolean => account.data.group === PREDEFINED_ACCOUNT_GROUPS.ED25519,
    );

    const systemAccountsGroupKey: string = 'system-accounts';
    const ecdsaGroupKey: string = 'accounts-created-ecdsa';
    const ecdsaAliasGroupKey: string = 'accounts-created-ecdsa-alias';
    const ed25519GroupKey: string = 'accounts-created-ed25519';

    const realm: Realm = this.localConfig.configuration.realmForDeployment(deployment);
    const shard: Shard = this.localConfig.configuration.shardForDeployment(deployment);
    const operatorAccountData: SystemAccount = {
      name: 'Operator',
      accountId: entityId(shard, realm, 2),
      publicKey: constants.GENESIS_PUBLIC_KEY,
    };

    if (constants.GENESIS_KEY === constants.DEFAULT_GENESIS_KEY) {
      operatorAccountData.privateKey = constants.DEFAULT_GENESIS_KEY;
    }

    const systemAccounts: SystemAccount[] = [operatorAccountData];

    if (systemAccounts.length > 0) {
      this.logger.addMessageGroup(systemAccountsGroupKey, 'System Accounts');

      for (const account of systemAccounts) {
        let message: string = `${account.name} Account ID: ${account.accountId.toString()}, Public Key: ${account.publicKey.toString()}`;
        if (account.privateKey) {
          message += `, Private Key: ${account.privateKey}`;
        }
        this.logger.addMessageGroupMessage(systemAccountsGroupKey, message);
      }

      this.logger.showMessageGroup(systemAccountsGroupKey);
    }

    this.logger.addMessageGroup(ecdsaGroupKey, 'ECDSA Accounts (Not EVM compatible, See ECDSA Alias Accounts above)');
    this.logger.addMessageGroup(ecdsaAliasGroupKey, 'ECDSA Alias Accounts (EVM compatible)');
    this.logger.addMessageGroup(ed25519GroupKey, 'ED25519 Accounts');

    if (aliasAccounts.length > 0) {
      for (const account of aliasAccounts) {
        this.logger.addMessageGroupMessage(
          ecdsaAliasGroupKey,
          `Account ID: ${account.accountId.toString()}, Public address: ${account.alias}, Private Key: 0x${account.data.privateKey.toStringRaw()}, Balance: ${account.data.balance.toString()}`,
        );
      }

      this.logger.showMessageGroup(ecdsaAliasGroupKey);
    }

    if (ed25519Accounts.length > 0) {
      for (const account of ed25519Accounts) {
        this.logger.addMessageGroupMessage(
          ed25519GroupKey,
          `Account ID: ${account.accountId.toString()}, Private Key: 0x${account.data.privateKey.toStringRaw()}, Balance: ${account.data.balance.toString()}`,
        );
      }

      this.logger.showMessageGroup(ed25519GroupKey);
    }

    if (ecdsaAccounts.length > 0) {
      for (const account of ecdsaAccounts) {
        this.logger.addMessageGroupMessage(
          ecdsaGroupKey,
          `Account ID: ${account.accountId.toString()}, Private Key: 0x${account.data.privateKey.toStringRaw()}, Balance: ${account.data.balance.toString()}`,
        );
      }

      this.logger.showMessageGroup(ecdsaGroupKey);
    }

    this.logger.showUser(
      'For more information on public and private keys see: https://docs.hedera.com/hedera/core-concepts/keys-and-signatures',
    );
  }

  public async get(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      accountId: string;
      namespace: NamespaceName;
      privateKey: boolean;
      deployment: DeploymentName;
      clusterRef: ClusterReferenceName;
      contextName: string;
    }

    interface Context {
      config: Config;
    }

    const tasks: Listr<Context, any, any> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);

            self.configManager.update(argv);
            await self.configManager.executePrompt(task, [flags.accountId]);

            flags.disablePrompts([flags.clusterRef]);

            const config = {
              accountId: self.configManager.getFlag(flags.accountId),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              privateKey: self.configManager.getFlag<boolean>(flags.privateKey),
              clusterRef: self.configManager.getFlag<ClusterReferenceName>(flags.clusterRef),
            } as Config;

            config.contextName =
              this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString() ??
              self.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            context_.config = config;

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfig.getClusterRefs(),
              config.deployment,
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'get the account info',
          task: async context_ => {
            self.accountInfo = await self.buildAccountInfo(
              await self.getAccountInfo(context_),
              context_.config.namespace,
              context_.config.privateKey,
            );
            this.logger.showJSON('account info', self.accountInfo);
            this.logger.showUser(AccountCommand.ACCOUNT_KEY_USER_MESSAGE);
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error in getting account info: ${error.message}`, error);
    } finally {
      await this.closeConnections();
    }

    return true;
  }

  public close(): Promise<void> {
    return this.closeConnections();
  }
}
