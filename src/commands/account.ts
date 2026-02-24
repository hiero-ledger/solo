// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {BaseCommand} from './base.js';
import {IllegalArgumentError} from '../core/errors/illegal-argument-error.js';
import {SoloError} from '../core/errors/solo-error.js';
import {Flags as flags} from './flags.js';
import {Listr, type ListrContext, type ListrRendererValue} from 'listr2';
import * as constants from '../core/constants.js';
import * as helpers from '../core/helpers.js';
import {entityId} from '../core/helpers.js';
import {type AccountManager} from '../core/account-manager.js';
import {
  AccountId,
  AccountInfo,
  Client,
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
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {
  type ClusterReferenceName,
  type Context,
  type DeploymentName,
  type Realm,
  type Shard,
  type AccountIdWithKeyPairObject,
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
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {NetworkNodes} from '../core/network-nodes.js';
import {LedgerPhase} from '../data/schema/model/remote/ledger-phase.js';
import {container} from 'tsyringe-neo';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {PathEx} from '../business/utils/path-ex.js';
import {type Secret} from '../integration/kube/resources/secret/secret.js';
import {type K8} from '../integration/kube/k8.js';
import * as CommandHelpers from './command-helpers.js';
import {invokeSoloCommand} from './command-helpers.js';
import {NodeCommandTasks} from './node/tasks.js';
import {ContainerName} from '../integration/kube/resources/container/container-name.js';

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
  accountInfo: {
    accountId: AccountId | string;
    balance: number;
    publicKey: string;
    privateKey?: string;
  };
}

@injectable()
export class AccountCommand extends BaseCommand {
  private static ACCOUNT_KEY_USER_MESSAGE: string =
    'where:\n' +
    '- privateKey: the hex-encoded private key which is used to sign transactions with in the Hiero SDKs\n' +
    '- privateKeyRaw: the Ethereum compatible private key, without the `0x` prefix\n' +
    '- for more information see: https://docs.hedera.com/hedera/core-concepts/keys-and-signatures';

  private accountInfo:
    | {
        accountId: string;
        balance: number;
        publicKey: string;
        privateKey?: string;
        accountAlias?: string;
      }
    | undefined;

  public constructor(
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.SystemAccounts) private readonly systemAccounts: number[][],
  ) {
    super();

    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.accountInfo = undefined;
    this.systemAccounts = patchInject(systemAccounts, InjectTokens.SystemAccounts, this.constructor.name);
  }

  public static INIT_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.nodeAliasesUnparsed, flags.clusterRef],
  };

  public static RESET_FLAGS_LIST: CommandFlags = {
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
    optional: [flags.clusterRef, flags.forcePortForward, flags.cacheDir, flags.devMode, flags.quiet],
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
      const accountKeys: AccountIdWithKeyPairObject = await this.accountManager.getAccountKeysFromSecret(
        newAccountInfo.accountId,
        namespace,
      );
      newAccountInfo.privateKey = accountKeys.privateKey;

      // reconstruct private key to retrieve EVM address if private key is ECDSA type
      try {
        const privateKey: PrivateKey = PrivateKey.fromStringDer(newAccountInfo.privateKey);
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
    let amount: number = context_.config.amount;
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
      const defaultAmount: number = flags.amount.definition.defaultValue as number;
      amount = amount || defaultAmount;
    }

    const hbarAmount: number = Number.parseFloat(amount.toString());
    if (Number.isNaN(hbarAmount)) {
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
    const operatorAccountId: AccountId = this.accountManager.getOperatorAccountId(deploymentName);
    return await this.accountManager.transferAmount(operatorAccountId, toAccountId, amount);
  }

  public async init(argv: ArgvStruct): Promise<boolean> {
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

    const tasks: Listr<Context, ListrRendererValue, ListrRendererValue> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_: Context, task: SoloListrTaskWrapper<Context>): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);

            this.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const clusterReference: ClusterReferenceName = this.getClusterReference();
            const contextName: string = this.getClusterContext(clusterReference);

            const config: Config = {
              deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
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

            await this.accountManager.loadNodeClient(
              config.namespace,
              this.remoteConfig.getClusterRefs(),
              this.configManager.getFlag<DeploymentName>(flags.deployment),
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'Update special account keys',
          task: (): SoloListr<Context> => {
            return new Listr(
              [
                {
                  title: 'Prepare for account key updates',
                  task: async (context_: Context): Promise<void> => {
                    const config: Config = context_.config;

                    context_.updateSecrets = await this.k8Factory
                      .getK8(config.clusterRef)
                      .secrets()
                      .list(config.namespace, ['solo.hedera.com/account-id'])
                      .then((secrets): boolean => secrets.length > 0);

                    context_.accountsBatchedSet = this.accountManager.batchAccounts(this.systemAccounts);

                    context_.resultTracker = {
                      rejectedCount: 0,
                      fulfilledCount: 0,
                      skippedCount: 0,
                    };

                    // do a write transaction to trigger the handler and generate the system accounts to complete genesis
                    const deployment: DeploymentName = config.deployment;
                    const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deployment);
                    const freezeAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);
                    await this.accountManager.transferAmount(treasuryAccountId, freezeAccountId, 1);
                  },
                },
                {
                  title: 'Update special account key sets',
                  task: (context_: Context, task: SoloListrTaskWrapper<Context>): SoloListr<Context> => {
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

                          context_.resultTracker = await this.accountManager.updateSpecialAccountsKeys(
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
                      const nodeClient: Client = await this.accountManager.refreshNodeClient(
                        config.namespace,
                        this.remoteConfig.getClusterRefs(),
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

                        this.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()} for node ${nodeAlias}`);

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
                    this.logger.showUser(chalk.green(`Account keys updated SUCCESSFULLY: ${fulfilledCount}`));

                    if (skippedCount > 0) {
                      this.logger.showUser(chalk.cyan(`Account keys updates SKIPPED: ${skippedCount}`));
                    }

                    if (rejectedCount > 0) {
                      this.logger.showUser(chalk.yellowBright(`Account keys updates with ERROR: ${rejectedCount}`));
                    }

                    this.logger.showUser(chalk.gray('Waiting for sockets to be closed....'));

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
      await this.create(argv);
      await this.create(argv);
    }

    return true;
  }

  public async resetSystem(argv: ArgvStruct): Promise<boolean> {
    interface Config {
      deployment: DeploymentName;
      namespace: NamespaceName;
      nodeAliases: NodeAliases;
    }

    interface ResetContext {
      config: Config;
    }

    const tasks: Listr<ResetContext, ListrRendererValue, ListrRendererValue> = new Listr(
      [
        {
          title: 'Freeze consensus network',
          task: async (
            context_,
            task,
          ): Promise<
            | Listr<ListrContext, ListrRendererValue, ListrRendererValue>
            | Listr<ListrContext, ListrRendererValue, ListrRendererValue>[]
          > => {
            const deployment: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);

            return invokeSoloCommand(
              'Freeze consensus network',
              'consensus network freeze',
              (): string[] => {
                const argv: string[] = CommandHelpers.newArgv();
                argv.push(
                  'consensus',
                  'network',
                  'freeze',
                  CommandHelpers.optionFromFlag(flags.deployment),
                  deployment,
                );
                return argv;
              },
              this.taskList,
            ).task(context_, task);
          },
        },
        {
          title: 'Idenitfy nodes',
          task: async (context_, task: SoloListrTaskWrapper<ResetContext>): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            this.configManager.update(argv);

            const deployment: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
            const namespace: NamespaceName = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );
            const nodeAliases: NodeAliases = helpers.parseNodeAliases(
              this.configManager.getFlag(flags.nodeAliasesUnparsed),
              this.remoteConfig.getConsensusNodes(),
              this.configManager,
            );
            const nodeTasks: NodeCommandTasks = container.resolve<NodeCommandTasks>(NodeCommandTasks);
            const resolvedNodeAliases: NodeAliases =
              nodeAliases.length > 0 ? nodeAliases : await nodeTasks.getExistingNodeAliases(namespace, deployment);
            if (resolvedNodeAliases.length === 0) {
              throw new SoloError('No consensus nodes found to reset; check your deployment or --node-aliases input.');
            }

            context_.config = {
              deployment,
              namespace,
              nodeAliases: resolvedNodeAliases,
            };
            console.log(`context_.config  = ${JSON.stringify(context_.config)}`);
          },
        },
        {
          title: 'Dump consensus node states',
          task: async (context_): Promise<void> => {
            const networkNodes: NetworkNodes = container.resolve<NetworkNodes>(NetworkNodes);
            const outputDirectory: string = PathEx.joinWithRealPath(constants.SOLO_LOGS_DIR, 'ledger-reset');

            for (const nodeAlias of context_.config.nodeAliases) {
              const resolvedContext: string =
                this.remoteConfig.extractContextFromConsensusNodes(nodeAlias) ??
                this.k8Factory.default().contexts().readCurrent();
              await networkNodes.getStatesFromPod(
                context_.config.namespace,
                nodeAlias,
                resolvedContext,
                outputDirectory,
              );
            }
          },
        },
        {
          title: 'Scale down block node StatefulSet(s)',
          skip: (): boolean => this.remoteConfig.configuration.state.blockNodes.length === 0,
          task: async (): Promise<void> => {
            for (const blockNode of this.remoteConfig.configuration.state.blockNodes) {
              const context: Context | undefined = this.remoteConfig.getClusterRefs().get(blockNode.metadata.cluster);
              if (!context) {
                throw new SoloError(`No cluster context found for block node ${blockNode.metadata.id}`);
              }

              const namespace: string = blockNode.metadata.namespace.toString();
              const statefulSetName: string = Templates.renderBlockNodeName(blockNode.metadata.id);
              await this.k8Factory.getK8(context).manifests().scaleStatefulSet(namespace, statefulSetName, 0);
            }
          },
        },
        {
          title: 'Scale down mirror importer deployment(s)',
          skip: (): boolean => this.remoteConfig.configuration.state.mirrorNodes.length === 0,
          task: async (): Promise<void> => {
            for (const mirrorNode of this.remoteConfig.configuration.state.mirrorNodes) {
              const context: Context | undefined = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
              if (!context) {
                throw new SoloError(`No cluster context found for mirror node ${mirrorNode.metadata.id}`);
              }

              const namespaceName: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
              const {mirrorNodeReleaseName} = await this.inferMirrorNodeData(namespaceName, context);
              const importerDeploymentName: string = `${mirrorNodeReleaseName}-importer`;
              await this.k8Factory
                .getK8(context)
                .manifests()
                .scaleDeployment(namespaceName.toString(), importerDeploymentName, 0);
            }
          },
        },
        {
          title: 'Reset mirror object storage streams',
          skip: (): boolean => this.remoteConfig.configuration.state.mirrorNodes.length === 0,
          task: async (): Promise<void> => {
            for (const mirrorNode of this.remoteConfig.configuration.state.mirrorNodes) {
              const context: Context | undefined = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
              if (!context) {
                throw new SoloError(`No cluster context found for mirror node ${mirrorNode.metadata.id}`);
              }

              const namespace: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
              const k8: K8 = this.k8Factory.getK8(context);
              const minioPods: Pod[] = await k8.pods().list(namespace, ['v1.min.io/tenant=minio']);

              for (const minioPod of minioPods) {
                await k8
                  .containers()
                  .readByRef(ContainerReference.of(minioPod.podReference, ContainerName.of('minio')))
                  .execContainer(['sh', '-c', 'rm -rf /export/data/solo-streams/*']);
              }
            }
          },
        },
        {
          title: 'Truncate mirror postgres data',
          skip: (): boolean => this.remoteConfig.configuration.state.mirrorNodes.length === 0,
          task: async (): Promise<void> => {
            const truncateSql: string = String.raw`
do
' 
declare
    t record;
begin
for t in select table_name
from information_schema.tables
where table_schema = ''public'' and table_name !~ ''.*(flyway|transaction_type|citus_).*'' and table_type <> ''VIEW''
    loop
    execute format(''lock table %s in access exclusive mode'', t.table_name);
    execute format(''truncate %s restart identity cascade'', t.table_name);
    commit;
    end loop;
end;
';
`;

            for (const mirrorNode of this.remoteConfig.configuration.state.mirrorNodes) {
              const context: Context | undefined = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
              if (!context) {
                throw new SoloError(`No cluster context found for mirror node ${mirrorNode.metadata.id}`);
              }

              const namespace: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
              const k8: K8 = this.k8Factory.getK8(context);
              const postgresPods: Pod[] = await k8.pods().list(namespace, ['app.kubernetes.io/name=postgres']);
              if (postgresPods.length === 0) {
                throw new SoloError(`postgres pod not found in namespace ${namespace}`);
              }

              const postgresPod: Pod = postgresPods[0];
              const postgresContainerReference: ContainerReference = ContainerReference.of(
                postgresPod.podReference,
                ContainerName.of('postgresql'),
              );

              const environmentOutput: string = await k8
                .containers()
                .readByRef(postgresContainerReference)
                .execContainer('/bin/bash -c printenv');
              const environmentLines: string[] = environmentOutput.split('\n');
              const prefixLine: string | undefined = environmentLines.find((line: string): boolean =>
                /_MIRROR_IMPORTER_DB_OWNER=/.test(line),
              );
              if (!prefixLine) {
                throw new SoloError('Could not find MIRROR_IMPORTER_DB_OWNER in mirror postgres environment.');
              }

              const environmentVariablePrefix: string = prefixLine.split('_MIRROR_IMPORTER_DB_OWNER=')[0];
              const databaseOwner: string = helpers.getEnvironmentValue(
                environmentLines,
                `${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNER`,
              );
              const databaseOwnerPassword: string = helpers.getEnvironmentValue(
                environmentLines,
                `${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNERPASSWORD`,
              );
              const databaseName: string = helpers.getEnvironmentValue(
                environmentLines,
                `${environmentVariablePrefix}_MIRROR_IMPORTER_DB_NAME`,
              );

              await k8
                .containers()
                .readByRef(postgresContainerReference)
                .execContainer([
                  'psql',
                  `postgresql://${databaseOwner}:${databaseOwnerPassword}@localhost:5432/${databaseName}`,
                  '-v',
                  'ON_ERROR_STOP=1',
                  '-c',
                  truncateSql,
                ]);
            }
          },
        },
        {
          title: 'Flush mirror redis cache',
          skip: (): boolean => this.remoteConfig.configuration.state.mirrorNodes.length === 0,
          task: async (): Promise<void> => {
            for (const mirrorNode of this.remoteConfig.configuration.state.mirrorNodes) {
              const context: Context | undefined = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
              if (!context) {
                throw new SoloError(`No cluster context found for mirror node ${mirrorNode.metadata.id}`);
              }

              const namespace: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
              const k8: K8 = this.k8Factory.getK8(context);
              const redisPods: Pod[] = await k8.pods().list(namespace, ['app.kubernetes.io/name=redis']);

              for (const redisPod of redisPods) {
                const redisContainerReference: ContainerReference = ContainerReference.of(
                  redisPod.podReference,
                  ContainerName.of('redis'),
                );

                await k8
                  .containers()
                  .readByRef(redisContainerReference)
                  .execContainer([
                    'sh',
                    '-c',
                    'PASSWORD_FILE="${REDIS_PASSWORD_FILE:-/opt/bitnami/redis/secrets/redis-password}"; ' +
                      'PASSWORD="${REDIS_PASSWORD:-$(cat "$PASSWORD_FILE" 2>/dev/null)}"; ' +
                      'if [ -z "$PASSWORD" ]; then echo "REDIS password not found" >&2; exit 1; fi; ' +
                      'if command -v redis-cli >/dev/null 2>&1; then ' +
                      '  redis-cli -a "$PASSWORD" --no-auth-warning FLUSHALL; ' +
                      'else ' +
                      '  /opt/bitnami/redis/bin/redis-cli -a "$PASSWORD" --no-auth-warning FLUSHALL; ' +
                      'fi',
                  ]);
              }
            }
          },
        },
        {
          title: 'Delete ledger account secrets',
          task: async (context_): Promise<void> => {
            for (const [, context] of this.remoteConfig.getClusterRefs()) {
              const secrets: Secret[] = await this.k8Factory
                .getK8(context)
                .secrets()
                .list(context_.config.namespace, ['solo.hedera.com/account-id']);

              for (const secret of secrets) {
                await this.k8Factory.getK8(context).secrets().delete(context_.config.namespace, secret.name);
              }
            }
          },
        },
        {
          title: 'Clear consensus node saved state',
          task: async (context_, task: SoloListrTaskWrapper<ResetContext>): Promise<SoloListr<ResetContext>> => {
            const subTasks: SoloListrTask<ResetContext>[] = [];
            console.log(`context_.config  = ${JSON.stringify(context_.config)}`);
            const nodeAliases: NodeAliases = context_.config.nodeAliases;
            if (!nodeAliases || nodeAliases.length === 0) {
              throw new SoloError('No consensus nodes found to reset; check your deployment or --node-aliases input.');
            }

            for (const nodeAlias of nodeAliases) {
              const resolvedContext: string =
                this.remoteConfig.extractContextFromConsensusNodes(nodeAlias) ??
                this.k8Factory.default().contexts().readCurrent();
              const k8: K8 = this.k8Factory.getK8(resolvedContext);
              const pods: Pod[] = await k8
                .pods()
                .list(context_.config.namespace, [
                  `solo.hedera.com/node-name=${nodeAlias}`,
                  'solo.hedera.com/type=network-node',
                ]);

              for (const pod of pods) {
                const containerReference: ContainerReference = ContainerReference.of(
                  pod.podReference,
                  constants.ROOT_CONTAINER,
                );
                subTasks.push({
                  title: `Node ${nodeAlias}: ${pod.podReference.name}`,
                  task: async (): Promise<void> => {
                    await k8
                      .containers()
                      .readByRef(containerReference)
                      .execContainer([
                        'bash',
                        '-c',
                        `rm -rf ${constants.HEDERA_HAPI_PATH}/data/saved/*; ` +
                          'rm -rf /opt/hgcapp/recordStreams/* /opt/hgcapp/recordStreams/.[!.]* /opt/hgcapp/recordStreams/..?*; ' +
                          'rm -rf /opt/hgcapp/eventsStreams/* /opt/hgcapp/eventsStreams/.[!.]* /opt/hgcapp/eventsStreams/..?*; ' +
                          'rm -rf /opt/hgcapp/blockStreams/* /opt/hgcapp/blockStreams/.[!.]* /opt/hgcapp/blockStreams/..?*; ' +
                          `if [ -f ${constants.HEDERA_HAPI_PATH}/data/config/.archive/genesis-network.json ]; then ` +
                          `cp ${constants.HEDERA_HAPI_PATH}/data/config/.archive/genesis-network.json ${constants.HEDERA_HAPI_PATH}/data/config/genesis-network.json; ` +
                          `else echo "ERROR: missing ${constants.HEDERA_HAPI_PATH}/data/config/.archive/genesis-network.json" >&2; exit 1; fi`,
                      ]);
                  },
                });
              }
            }

            return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
          },
        },
        {
          title: 'Restart consensus node pods',
          task: async (context_): Promise<void> => {
            const nodeAliases: NodeAliases = context_.config.nodeAliases;
            for (const nodeAlias of nodeAliases) {
              const resolvedContext: string =
                this.remoteConfig.extractContextFromConsensusNodes(nodeAlias) ??
                this.k8Factory.default().contexts().readCurrent();
              const k8: K8 = this.k8Factory.getK8(resolvedContext);
              const labels: string[] = [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'];
              const pods: Pod[] = await k8.pods().list(context_.config.namespace, labels);
              for (const pod of pods) {
                const podName: string = pod.podReference.name.toString();
                await k8.pods().delete(pod.podReference);

                // Ensure uploader-side stream state is fully reset by recreating stream PVCs.
                // Deleting these claims after pod deletion avoids stale stream/signature chain data.
                const streamPvcNames: string[] = [
                  `hgcapp-record-streams-pvc-${podName}`,
                  `hgcapp-event-streams-pvc-${podName}`,
                  `hgcapp-blockstream-pvc-${podName}`,
                ];
                for (const pvcName of streamPvcNames) {
                  try {
                    await k8.pvcs().delete(PvcReference.of(context_.config.namespace, PvcName.of(pvcName)));
                  } catch (error) {
                    this.logger.debug(
                      `Skipping stream PVC deletion for ${pvcName}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                  }
                }
              }
              await k8.pods().waitForRunningPhase(context_.config.namespace, labels, 120, 1000);
              await k8.pods().waitForReadyStatus(context_.config.namespace, labels, 120, 1000);
            }
          },
        },
        {
          title: 'Reset block node PVCs',
          skip: (): boolean => this.remoteConfig.configuration.state.blockNodes.length === 0,
          task: async (): Promise<void> => {
            for (const blockNode of this.remoteConfig.configuration.state.blockNodes) {
              const context: Context | undefined = this.remoteConfig.getClusterRefs().get(blockNode.metadata.cluster);
              if (!context) {
                throw new SoloError(`No cluster context found for block node ${blockNode.metadata.id}`);
              }
              const releaseName: string = Templates.renderBlockNodeName(blockNode.metadata.id);
              const pvcs: string[] = await this.k8Factory
                .getK8(context)
                .pvcs()
                .list(NamespaceName.of(blockNode.metadata.namespace), [`app.kubernetes.io/instance=${releaseName}`]);

              for (const pvc of pvcs) {
                await this.k8Factory
                  .getK8(context)
                  .pvcs()
                  .delete(PvcReference.of(NamespaceName.of(blockNode.metadata.namespace), PvcName.of(pvc)));
              }
            }
          },
        },
        {
          title: 'Reset ledger phase to uninitialized',
          task: async (): Promise<void> => {
            this.remoteConfig.configuration.state.ledgerPhase = LedgerPhase.UNINITIALIZED;
            await this.remoteConfig.persist();
          },
        },
        {
          title: 'Start consensus nodes',
          task: async (
            context_,
            task,
          ): Promise<
            | Listr<ListrContext, ListrRendererValue, ListrRendererValue>
            | Listr<ListrContext, ListrRendererValue, ListrRendererValue>[]
          > => {
            const nodeAliases: NodeAliases = context_.config.nodeAliases;
            if (!nodeAliases || nodeAliases.length === 0) {
              throw new SoloError('No consensus nodes found to start; check your deployment or --node-aliases input.');
            }
            return invokeSoloCommand(
              'Start consensus nodes',
              'consensus node start',
              (): string[] => {
                const argv: string[] = CommandHelpers.newArgv();
                argv.push(
                  'consensus',
                  'node',
                  'start',
                  CommandHelpers.optionFromFlag(flags.deployment),
                  context_.config.deployment,
                  CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                  nodeAliases.join(','),
                );
                return argv;
              },
              this.taskList,
            ).task(context_, task);
          },
        },
        {
          title: 'Scale up block node StatefulSet(s)',
          skip: (): boolean => this.remoteConfig.configuration.state.blockNodes.length === 0,
          task: async (): Promise<void> => {
            for (const blockNode of this.remoteConfig.configuration.state.blockNodes) {
              const context: Context | undefined = this.remoteConfig.getClusterRefs().get(blockNode.metadata.cluster);
              if (!context) {
                throw new SoloError(`No cluster context found for block node ${blockNode.metadata.id}`);
              }

              const namespace: string = blockNode.metadata.namespace.toString();
              const statefulSetName: string = Templates.renderBlockNodeName(blockNode.metadata.id);
              await this.k8Factory.getK8(context).manifests().scaleStatefulSet(namespace, statefulSetName, 1);
            }
          },
        },
        {
          title: 'Scale up mirror importer deployment(s)',
          skip: (): boolean => this.remoteConfig.configuration.state.mirrorNodes.length === 0,
          task: async (): Promise<void> => {
            for (const mirrorNode of this.remoteConfig.configuration.state.mirrorNodes) {
              const context: Context | undefined = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
              if (!context) {
                throw new SoloError(`No cluster context found for mirror node ${mirrorNode.metadata.id}`);
              }

              const namespaceName: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
              const {mirrorNodeReleaseName} = await this.inferMirrorNodeData(namespaceName, context);
              const importerDeploymentName: string = `${mirrorNodeReleaseName}-importer`;
              const k8: K8 = this.k8Factory.getK8(context);

              await k8.manifests().scaleDeployment(namespaceName.toString(), importerDeploymentName, 1);

              // Wait for postgres and importer readiness to avoid transient importer connection-refused startup races.
              await k8
                .pods()
                .waitForReadyStatus(
                  namespaceName,
                  ['app.kubernetes.io/name=postgres', `app.kubernetes.io/instance=${mirrorNodeReleaseName}`],
                  180,
                  1000,
                );
              await k8
                .pods()
                .waitForReadyStatus(
                  namespaceName,
                  ['app.kubernetes.io/name=importer', `app.kubernetes.io/instance=${mirrorNodeReleaseName}`],
                  180,
                  1000,
                );
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    await tasks.run();
    return true;
  }

  public async create(argv: ArgvStruct): Promise<boolean> {
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

    const tasks: Listr<Context, ListrRendererValue, ListrRendererValue> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_: Context, task: SoloListrTaskWrapper<Context>): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);

            this.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const config: Config = {
              amount: this.configManager.getFlag(flags.amount),
              ecdsaPrivateKey: this.configManager.getFlag(flags.ecdsaPrivateKey),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: this.configManager.getFlag(flags.deployment),
              ed25519PrivateKey: this.configManager.getFlag(flags.ed25519PrivateKey),
              setAlias: this.configManager.getFlag(flags.setAlias),
              generateEcdsaKey: this.configManager.getFlag(flags.generateEcdsaKey),
              privateKey: this.configManager.getFlag(flags.privateKey),
              createAmount: this.configManager.getFlag(flags.createAmount),
              clusterRef: this.configManager.getFlag(flags.clusterRef),
            } as Config;

            config.contextName =
              this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString() ??
              this.k8Factory.default().contexts().readCurrent();

            if (!config.amount) {
              config.amount = flags.amount.definition.defaultValue as number;
            }

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            context_.config = config;

            await this.accountManager.loadNodeClient(
              context_.config.namespace,
              this.remoteConfig.getClusterRefs(),
              config.deployment,
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'create the new account',
          task: async (context_: Context, task: SoloListrTaskWrapper<Context>): Promise<SoloListr<Context>> => {
            const subTasks: SoloListrTask<Context>[] = [];

            for (let index: number = 0; index < context_.config.createAmount; index++) {
              subTasks.push({
                title: `Create accounts [${index}]`,
                task: async (context_: Context): Promise<void> => {
                  this.accountInfo = await this.createNewAccount(context_);
                  const accountInfoCopy: {
                    accountId: string;
                    balance: number;
                    publicKey: string;
                    privateKey?: string;
                    accountAlias?: string;
                  } = {...this.accountInfo};
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
    const tasks: Listr<UpdateAccountContext, ListrRendererValue, ListrRendererValue> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (
            context_: UpdateAccountContext,
            task: SoloListrTaskWrapper<UpdateAccountContext>,
          ): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);

            this.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            await this.configManager.executePrompt(task, [flags.accountId]);

            const config: UpdateAccountConfig = {
              accountId: this.configManager.getFlag(flags.accountId),
              amount: this.configManager.getFlag<number>(flags.amount),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
              ecdsaPrivateKey: this.configManager.getFlag(flags.ecdsaPrivateKey),
              ed25519PrivateKey: this.configManager.getFlag(flags.ed25519PrivateKey),
              clusterRef: this.configManager.getFlag<ClusterReferenceName>(flags.clusterRef),
              contextName: '',
            };

            config.contextName =
              this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString() ??
              this.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            context_.config = config;

            await this.accountManager.loadNodeClient(
              config.namespace,
              this.remoteConfig.getClusterRefs(),
              config.deployment,
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'get the account info',
          task: async (context_: UpdateAccountContext): Promise<void> => {
            context_.accountInfo = await this.buildAccountInfo(
              await this.getAccountInfo(context_),
              context_.config.namespace,
              !!context_.config.ed25519PrivateKey,
            );
          },
        },
        {
          title: 'update the account',
          task: async (context_: UpdateAccountContext): Promise<void> => {
            if (!(await this.updateAccountInfo(context_))) {
              throw new SoloError(`An error occurred updating account ${context_.accountInfo.accountId}`);
            }
          },
        },
        {
          title: 'get the updated account info',
          task: async (context_: UpdateAccountContext): Promise<void> => {
            this.accountInfo = await this.buildAccountInfo(
              await this.getAccountInfo(context_),
              context_.config.namespace,
              false,
            );
            this.logger.showJSON('account info', this.accountInfo);
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

    const tasks: Listr<Context, ListrRendererValue, ListrRendererValue> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);

            this.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const config: Config = {
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: this.configManager.getFlag(flags.deployment),
              clusterRef: this.configManager.getFlag(flags.clusterRef),
              contextName: '',
            };

            config.contextName =
              this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString() ??
              this.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            context_.config = config;
            context_.createdAccounts = [];

            await this.accountManager.loadNodeClient(
              config.namespace,
              this.remoteConfig.getClusterRefs(),
              config.deployment,
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'Create predefined accounts',
          task: async (context_: Context, task: SoloListrTaskWrapper<Context>): Promise<Listr<Context>> => {
            const subTasks: SoloListrTask<Context>[] = [];
            const accountsToCreate: PredefinedAccount[] = [
              ...predefinedEcdsaAccounts,
              ...predefinedEcdsaAccountsWithAlias,
              ...predefinedEd25519Accounts,
            ];

            for (const [index, account] of accountsToCreate.entries()) {
              subTasks.push({
                title: `Creating Account ${index}`,
                task: async (context_: Context, subTask: SoloListrTaskWrapper<Context>): Promise<void> => {
                  await helpers.sleep(Duration.ofMillis(100 * index));
                  const balance: Hbar = account.balance ?? Hbar.from(0, HbarUnit.Hbar);
                  const createdAccount: {
                    accountId: string;
                    privateKey: string;
                    publicKey: string;
                    balance: number;
                    accountAlias?: string;
                  } = await this.accountManager.createNewAccount(
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
            this.showPredefinedAccounts(context_.createdAccounts, context_.config.deployment);
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

    const tasks: Listr<Context, ListrRendererValue, ListrRendererValue> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_: Context, task: SoloListrTaskWrapper<Context>): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);

            this.configManager.update(argv);
            await this.configManager.executePrompt(task, [flags.accountId]);

            flags.disablePrompts([flags.clusterRef]);

            const config: Config = {
              accountId: this.configManager.getFlag(flags.accountId),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
              privateKey: this.configManager.getFlag<boolean>(flags.privateKey),
              clusterRef: this.configManager.getFlag<ClusterReferenceName>(flags.clusterRef),
              contextName: '',
            } as Config;

            config.contextName =
              this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString() ??
              this.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            context_.config = config;

            await this.accountManager.loadNodeClient(
              config.namespace,
              this.remoteConfig.getClusterRefs(),
              config.deployment,
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'get the account info',
          task: async (context_: Context): Promise<void> => {
            this.accountInfo = await this.buildAccountInfo(
              await this.getAccountInfo(context_),
              context_.config.namespace,
              context_.config.privateKey,
            );
            this.logger.showJSON('account info', this.accountInfo);
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
