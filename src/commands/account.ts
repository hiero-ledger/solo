// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../core/errors/solo-errors.js';
import chalk from 'chalk';
import * as fs from 'node:fs';
import {BaseCommand} from './base.js';
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
  predefinedEcdsaAccountsWithAlias,
  type SystemAccount,
} from './one-shot/predefined-accounts.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {LedgerPhase} from '../data/schema/model/remote/ledger-phase.js';
import {DeploymentPhase} from '../data/schema/model/remote/deployment-phase.js';
import {container} from 'tsyringe-neo';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {type Secret} from '../integration/kube/resources/secret/secret.js';
import {type K8} from '../integration/kube/k8.js';
import * as CommandHelpers from './command-helpers.js';
import {invokeSoloCommand} from './command-helpers.js';
import {NodeCommandTasks} from './node/tasks.js';
import {ContainerName} from '../integration/kube/resources/container/container-name.js';
import {ConsensusCommandDefinition} from './command-definitions/consensus-command-definition.js';
import {OneShotCommandDefinition} from './command-definitions/one-shot-command-definition.js';

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

interface BlockNumberRange {
  first: number | null;
  last: number | null;
}

interface BlockNumberSample extends BlockNumberRange {
  componentId: string;
  context: Context;
  namespace: string;
  podName: string;
  source: string;
}

interface LedgerResetCheckpointSnapshot {
  phase: 'pre-reset' | 'post-reset';
  capturedAt: string;
  consensusSamples: BlockNumberSample[];
  blockNodeSamples: BlockNumberSample[];
  mirrorImporterSamples: BlockNumberSample[];
  notes: string[];
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
    required: [],
    optional: [flags.deployment, flags.nodeAliasesUnparsed, flags.clusterRef],
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
      throw new SoloErrors.validation.illegalArgument('An instance of AccountInfo is required');
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
                      .getK8(config.contextName)
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
      debugSnapshots: LedgerResetCheckpointSnapshot[];
      debugOutputFile: string;
    }

    const shouldSkipConsensusPodRestart: boolean = process.env.SOLO_LEDGER_RESET_SKIP_POD_RESTART !== 'false';

    const tasks: Listr<ResetContext, ListrRendererValue, ListrRendererValue> = new Listr(
      [
        {
          title: 'Identify nodes',
          task: async (context_, task: SoloListrTaskWrapper<ResetContext>): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            this.configManager.update(argv);

            const deployment: DeploymentName =
              this.configManager.getFlag<DeploymentName>(flags.deployment) ?? OneShotCommandDefinition.COMMAND_NAME;
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
            context_.debugSnapshots = [];
            context_.debugOutputFile = `${constants.SOLO_LOGS_DIR}/ledger-reset/ledger-reset-block-checkpoints-${Date.now()}.json`;
            this.logger.debug(`context_.config  = ${JSON.stringify(context_.config)}`);
          },
        },
        {
          title: 'Capture pre-reset block checkpoints',
          task: async (context_): Promise<void> => {
            const snapshot: LedgerResetCheckpointSnapshot = await this.captureLedgerResetCheckpoint(
              context_.config,
              'pre-reset',
            );
            context_.debugSnapshots.push(snapshot);
            this.logLedgerResetCheckpointSummary(snapshot);
          },
        },
        {
          title: 'Stop consensus nodes',
          task: async (
            context_,
            task,
          ): Promise<
            | Listr<ListrContext, ListrRendererValue, ListrRendererValue>
            | Listr<ListrContext, ListrRendererValue, ListrRendererValue>[]
          > =>
            invokeSoloCommand(
              'Stop consensus nodes',
              `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NODE_STOP}`,
              (): string[] => {
                const commandArgv: string[] = CommandHelpers.newArgv();
                commandArgv.push(
                  ConsensusCommandDefinition.COMMAND_NAME,
                  ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
                  ConsensusCommandDefinition.NODE_STOP,
                  CommandHelpers.optionFromFlag(flags.deployment),
                  context_.config.deployment,
                  CommandHelpers.optionFromFlag(flags.nodeAliasesUnparsed),
                  context_.config.nodeAliases.join(','),
                );
                return commandArgv;
              },
              this.taskList,
            ).task(context_, task),
        },
        {
          title: 'Change node state to frozen in remote config',
          task: async (context_): Promise<void> => {
            for (const nodeAlias of context_.config.nodeAliases) {
              this.remoteConfig.configuration.components.changeNodePhase(
                Templates.renderComponentIdFromNodeAlias(nodeAlias),
                DeploymentPhase.FROZEN,
              );
            }

            await this.remoteConfig.persist();
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
              const k8: K8 = this.k8Factory.getK8(context);
              await k8.manifests().scaleStatefulSet(namespace, statefulSetName, 0);
              await this.waitForPodsToTerminate(
                k8,
                NamespaceName.of(namespace),
                [`app.kubernetes.io/instance=${statefulSetName}`, 'block-node.hiero.com/type=block-node'],
                `block node ${statefulSetName}`,
              );
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
              const k8: K8 = this.k8Factory.getK8(context);
              await k8.manifests().scaleDeployment(namespaceName.toString(), importerDeploymentName, 0);
              await this.waitForPodsToTerminate(
                k8,
                namespaceName,
                [
                  'app.kubernetes.io/name=importer',
                  'app.kubernetes.io/component=importer',
                  `app.kubernetes.io/instance=${mirrorNodeReleaseName}`,
                ],
                `mirror importer ${importerDeploymentName}`,
              );
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
            const truncateSql: string = fs.readFileSync(constants.MIRROR_POSTGRES_TRUNCATE_SQL_FILE, 'utf8');
            for (const mirrorNode of this.remoteConfig.configuration.state.mirrorNodes) {
              const context: Context | undefined = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
              if (!context) {
                throw new SoloError(`No cluster context found for mirror node ${mirrorNode.metadata.id}`);
              }

              const namespace: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
              const k8: K8 = this.k8Factory.getK8(context);
              const postgresPods: Pod[] = await k8.pods().list(namespace, [constants.SOLO_MIRROR_POSTGRES_NAME_LABEL]);
              if (postgresPods.length === 0) {
                throw new SoloError(`postgres pod not found in namespace ${namespace}`);
              }

              const postgresPod: Pod = postgresPods[0];
              const postgresContainerReference: ContainerReference = ContainerReference.of(
                postgresPod.podReference,
                ContainerName.of('postgresql'),
              );

              const mirrorPasswordsSecret: Secret = await k8.secrets().read(namespace, 'mirror-passwords');
              const ownerKey: string | undefined = Object.keys(mirrorPasswordsSecret.data).find(
                (key: string): boolean => key.endsWith('_MIRROR_IMPORTER_DB_OWNER'),
              );
              if (!ownerKey) {
                throw new SoloError('Could not find MIRROR_IMPORTER_DB_OWNER in mirror-passwords secret.');
              }

              const environmentVariablePrefix: string = ownerKey.replace('_MIRROR_IMPORTER_DB_OWNER', '');
              const databaseOwner: string = Base64.decode(
                mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNER`],
              );
              const databaseOwnerPassword: string = Base64.decode(
                mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNERPASSWORD`],
              );
              const databaseName: string = Base64.decode(
                mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_NAME`],
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
              const redisPods: Pod[] = await k8.pods().list(namespace, [constants.SOLO_MIRROR_REDIS_NAME_LABEL]);

              for (const redisPod of redisPods) {
                const redisContainerReference: ContainerReference = ContainerReference.of(
                  redisPod.podReference,
                  ContainerName.of('redis'),
                );

                await k8
                  .containers()
                  .readByRef(redisContainerReference)
                  .execContainer([
                    'bash',
                    '-c',
                    // Credentials are read from the mounted secret file or the REDIS_PASSWORD env var
                    // already present inside the container — never passed as a CLI argument.
                    // REDISCLI_AUTH is the env var that redis-cli reads natively, so the password
                    // never appears in the process argument list and is not visible in `ps` output.
                    'PASSWORD_FILE="${REDIS_PASSWORD_FILE:-/opt/bitnami/redis/secrets/redis-password}"; ' +
                      'export REDISCLI_AUTH="${REDIS_PASSWORD:-$(cat "$PASSWORD_FILE" 2>/dev/null)}"; ' +
                      'if [ -z "$REDISCLI_AUTH" ]; then echo "REDIS password not found" >&2; exit 1; fi; ' +
                      'if command -v redis-cli >/dev/null 2>&1; then ' +
                      '  redis-cli FLUSHALL; ' +
                      'else ' +
                      '  /opt/bitnami/redis/bin/redis-cli FLUSHALL; ' +
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
            this.logger.debug(`context_.config  = ${JSON.stringify(context_.config)}`);
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
          title: 'Optional: recreate consensus node pods and reset persisted state',
          skip: (): boolean => shouldSkipConsensusPodRestart,
          task: async (context_, task: SoloListrTaskWrapper<ResetContext>): Promise<SoloListr<ResetContext>> => {
            const nodeAliases: NodeAliases = context_.config.nodeAliases;
            const subTasks: SoloListrTask<ResetContext>[] = nodeAliases.map(
              (nodeAlias): SoloListrTask<ResetContext> => ({
                title: `Recreate ${nodeAlias}`,
                task: async (): Promise<void> => {
                  const resolvedContext: string =
                    this.remoteConfig.extractContextFromConsensusNodes(nodeAlias) ??
                    this.k8Factory.default().contexts().readCurrent();
                  const k8: K8 = this.k8Factory.getK8(resolvedContext);
                  const labels: string[] = [
                    `solo.hedera.com/node-name=${nodeAlias}`,
                    'solo.hedera.com/type=network-node',
                  ];
                  const pods: Pod[] = await k8.pods().list(context_.config.namespace, labels);
                  for (const pod of pods) {
                    const podName: string = pod.podReference.name.toString();
                    await k8.pods().delete(pod.podReference);

                    // Reset the PVC-backed stream and saved-state storage, but leave stable pod readiness
                    // checks to the later node-start path. That path already waits for a stable ready pod
                    // immediately before exec'ing into it, so only waiting for replacement pod creation
                    // here avoids paying the same 15s settle cost twice.
                    const resetPvcNames: string[] = [
                      `hgcapp-record-streams-pvc-${podName}`,
                      `hgcapp-event-streams-pvc-${podName}`,
                      `hgcapp-blockstream-pvc-${podName}`,
                      `hgcapp-data-saved-pvc-${podName}`,
                      `hgcapp-state-pvc-${podName}`,
                    ];
                    await Promise.all(
                      resetPvcNames.map(async (pvcName: string): Promise<void> => {
                        try {
                          await k8.pvcs().delete(PvcReference.of(context_.config.namespace, PvcName.of(pvcName)));
                        } catch (error) {
                          this.logger.debug(
                            `Skipping reset PVC deletion for ${pvcName}: ${error instanceof Error ? error.message : String(error)}`,
                          );
                        }
                      }),
                    );
                  }

                  await k8.pods().waitForRunningPhase(context_.config.namespace, labels, 120, 1000);
                },
              }),
            );

            return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
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
          title: 'Bring services back online',
          task: async (_context_, task: SoloListrTaskWrapper<ResetContext>): Promise<SoloListr<ResetContext>> =>
            task.newListr(
              [
                {
                  title: 'Scale up block node StatefulSet(s)',
                  skip: (): boolean => this.remoteConfig.configuration.state.blockNodes.length === 0,
                  task: async (): Promise<void> => {
                    for (const blockNode of this.remoteConfig.configuration.state.blockNodes) {
                      const context: Context | undefined = this.remoteConfig
                        .getClusterRefs()
                        .get(blockNode.metadata.cluster);
                      if (!context) {
                        throw new SoloError(`No cluster context found for block node ${blockNode.metadata.id}`);
                      }

                      const namespace: string = blockNode.metadata.namespace.toString();
                      const statefulSetName: string = Templates.renderBlockNodeName(blockNode.metadata.id);
                      const k8: K8 = this.k8Factory.getK8(context);
                      await k8.manifests().scaleStatefulSet(namespace, statefulSetName, 1);
                      await k8
                        .pods()
                        .waitForReadyStatus(
                          NamespaceName.of(namespace),
                          [`app.kubernetes.io/instance=${statefulSetName}`, 'block-node.hiero.com/type=block-node'],
                          constants.PODS_READY_MAX_ATTEMPTS,
                          constants.PODS_READY_DELAY,
                          undefined,
                          true,
                        );
                    }
                  },
                },
                {
                  title: 'Scale up mirror importer deployment(s)',
                  skip: (): boolean => this.remoteConfig.configuration.state.mirrorNodes.length === 0,
                  task: async (): Promise<void> => {
                    for (const mirrorNode of this.remoteConfig.configuration.state.mirrorNodes) {
                      const context: Context | undefined = this.remoteConfig
                        .getClusterRefs()
                        .get(mirrorNode.metadata.cluster);
                      if (!context) {
                        throw new SoloError(`No cluster context found for mirror node ${mirrorNode.metadata.id}`);
                      }

                      const namespaceName: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
                      const {mirrorNodeReleaseName} = await this.inferMirrorNodeData(namespaceName, context);
                      const importerDeploymentName: string = `${mirrorNodeReleaseName}-importer`;
                      const k8: K8 = this.k8Factory.getK8(context);
                      await k8.manifests().scaleDeployment(namespaceName.toString(), importerDeploymentName, 1);

                      await k8
                        .pods()
                        .waitForReadyStatus(
                          namespaceName,
                          [
                            'app.kubernetes.io/name=importer',
                            'app.kubernetes.io/component=importer',
                            `app.kubernetes.io/instance=${mirrorNodeReleaseName}`,
                          ],
                          constants.PODS_READY_MAX_ATTEMPTS,
                          constants.PODS_READY_DELAY,
                          undefined,
                          true,
                        );
                    }
                  },
                },
                {
                  title: 'Start consensus node services',
                  task: async (
                    context_,
                    task,
                  ): Promise<
                    | Listr<ListrContext, ListrRendererValue, ListrRendererValue>
                    | Listr<ListrContext, ListrRendererValue, ListrRendererValue>[]
                  > => {
                    const nodeAliases: NodeAliases = context_.config.nodeAliases;
                    if (!nodeAliases || nodeAliases.length === 0) {
                      throw new SoloError(
                        'No consensus nodes found to start; check your deployment or --node-aliases input.',
                      );
                    }
                    return invokeSoloCommand(
                      'Start consensus nodes',
                      ConsensusCommandDefinition.START_COMMAND,
                      (): string[] => {
                        const argv: string[] = CommandHelpers.newArgv();
                        argv.push(
                          ConsensusCommandDefinition.COMMAND_NAME,
                          ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
                          ConsensusCommandDefinition.NODE_START,
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
              ],
              constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
            ),
        },
        {
          title: 'Capture post-reset block checkpoints',
          task: async (context_): Promise<void> => {
            const maxAttempts: number = 30;
            const delayBetweenAttemptsMs: number = 2000;
            let snapshot: LedgerResetCheckpointSnapshot = await this.captureLedgerResetCheckpoint(
              context_.config,
              'post-reset',
            );

            for (let attempt: number = 1; attempt < maxAttempts; attempt++) {
              if (this.hasRequiredPostResetSignals(snapshot)) {
                break;
              }
              await helpers.sleep(Duration.ofMillis(delayBetweenAttemptsMs));
              snapshot = await this.captureLedgerResetCheckpoint(context_.config, 'post-reset');
            }

            context_.debugSnapshots.push(snapshot);
            this.logLedgerResetCheckpointSummary(snapshot);

            fs.mkdirSync(`${constants.SOLO_LOGS_DIR}/ledger-reset`, {recursive: true});
            fs.writeFileSync(context_.debugOutputFile, JSON.stringify(context_.debugSnapshots, undefined, 2), 'utf8');
            this.logger.showUser(`Ledger reset block checkpoints saved to ${context_.debugOutputFile}`);
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    await tasks.run();
    return true;
  }

  private hasRequiredPostResetSignals(snapshot: LedgerResetCheckpointSnapshot): boolean {
    const consensusRange: BlockNumberRange = this.aggregateBlockNumberSamples(snapshot.consensusSamples);
    const blockNodeRange: BlockNumberRange = this.aggregateBlockNumberSamples(snapshot.blockNodeSamples);
    const mirrorImporterRange: BlockNumberRange = this.aggregateBlockNumberSamples(snapshot.mirrorImporterSamples);

    return consensusRange.first !== null && blockNodeRange.first !== null && mirrorImporterRange.first !== null;
  }

  private async waitForPodsToTerminate(
    k8: K8,
    namespace: NamespaceName,
    labels: string[],
    componentDescription: string,
    maxAttempts: number = 180,
    delayMs: number = 1000,
  ): Promise<void> {
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      const pods: Pod[] = await k8.pods().list(namespace, labels);
      if (pods.length === 0) {
        return;
      }

      const podNames: string = pods.map((pod: Pod): string => pod.podReference.name.toString()).join(', ');
      this.logger.debug(
        `Waiting for ${componentDescription} pods to terminate [attempt ${attempt}/${maxAttempts}] [pods=${podNames}]`,
      );
      await helpers.sleep(Duration.ofMillis(delayMs));
    }

    throw new SoloError(
      `Timed out waiting for ${componentDescription} pods to terminate in namespace ${namespace.toString()} for labels [${labels.join(', ')}]`,
    );
  }

  private async captureLedgerResetCheckpoint(
    config: {deployment: DeploymentName; namespace: NamespaceName; nodeAliases: NodeAliases},
    phase: 'pre-reset' | 'post-reset',
  ): Promise<LedgerResetCheckpointSnapshot> {
    const notes: string[] = [];
    const consensusSamples: BlockNumberSample[] = await this.collectConsensusSamples(config, notes);
    const blockNodeSamples: BlockNumberSample[] = await this.collectBlockNodeSamples(notes);
    const mirrorImporterSamples: BlockNumberSample[] = await this.collectMirrorImporterSamples(notes);

    return {
      phase,
      capturedAt: new Date().toISOString(),
      consensusSamples,
      blockNodeSamples,
      mirrorImporterSamples,
      notes,
    };
  }

  private async collectConsensusSamples(
    config: {namespace: NamespaceName; nodeAliases: NodeAliases},
    notes: string[],
  ): Promise<BlockNumberSample[]> {
    const samples: BlockNumberSample[] = [];
    const namespace: NamespaceName = config.namespace;

    for (const nodeAlias of config.nodeAliases) {
      const context: Context =
        this.remoteConfig.extractContextFromConsensusNodes(nodeAlias) ??
        this.k8Factory.default().contexts().readCurrent();
      const k8: K8 = this.k8Factory.getK8(context);
      const labels: string[] = [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'];
      const pods: Pod[] = await k8.pods().list(namespace, labels);

      if (pods.length === 0) {
        notes.push(`No consensus pod found for ${nodeAlias} in ${namespace} (${context})`);
        continue;
      }

      for (const pod of pods) {
        try {
          const containerReference: ContainerReference = ContainerReference.of(
            pod.podReference,
            constants.ROOT_CONTAINER,
          );
          const listBlocksScript: string = String.raw`numbers=$(find /opt/hgcapp/blockStreams -type f \( -name "*.blk" -o -name "*.blk.gz" \) 2>/dev/null | sed -En 's#^.*/0*([0-9]+)\.blk(\.gz)?$#\1#p' | sort -n); if [ -z "$numbers" ]; then echo ""; else first=$(echo "$numbers" | head -n 1); last=$(echo "$numbers" | tail -n 1); echo "$first|$last"; fi`;
          const output: string = await k8
            .containers()
            .readByRef(containerReference)
            .execContainer(['bash', '-c', listBlocksScript]);
          const range: BlockNumberRange = this.parseRangeOutput(output);
          samples.push({
            componentId: nodeAlias,
            context,
            namespace: namespace.toString(),
            podName: pod.podReference.name.toString(),
            first: range.first,
            last: range.last,
            source: '/opt/hgcapp/blockStreams/*.blk',
          });
        } catch (error) {
          notes.push(
            `Failed reading consensus block stream files for ${nodeAlias}/${pod.podReference.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return samples;
  }

  private async collectBlockNodeSamples(notes: string[]): Promise<BlockNumberSample[]> {
    const samples: BlockNumberSample[] = [];

    for (const blockNode of this.remoteConfig.configuration.state.blockNodes) {
      const context: Context | undefined = this.remoteConfig.getClusterRefs().get(blockNode.metadata.cluster);
      if (!context) {
        notes.push(`No cluster context found for block node ${blockNode.metadata.id}`);
        continue;
      }

      const namespace: NamespaceName = NamespaceName.of(blockNode.metadata.namespace);
      const releaseName: string = Templates.renderBlockNodeName(blockNode.metadata.id);
      const k8: K8 = this.k8Factory.getK8(context);
      const pods: Pod[] = await k8.pods().list(namespace, [`app.kubernetes.io/instance=${releaseName}`]);

      if (pods.length === 0) {
        notes.push(`No block node pod found for ${releaseName} in ${namespace} (${context})`);
        continue;
      }

      for (const pod of pods) {
        try {
          const logs: string = await k8.pods().readLogs(pod.podReference, true);
          const numbers: number[] = this.extractBlockNumbersFromText(logs);
          const range: BlockNumberRange = this.toRange(numbers);
          samples.push({
            componentId: releaseName,
            context,
            namespace: namespace.toString(),
            podName: pod.podReference.name.toString(),
            first: range.first,
            last: range.last,
            source: 'kubernetes pod logs',
          });
        } catch (error) {
          notes.push(
            `Failed reading block node logs for ${releaseName}/${pod.podReference.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return samples;
  }

  private async collectMirrorImporterSamples(notes: string[]): Promise<BlockNumberSample[]> {
    const samples: BlockNumberSample[] = [];

    for (const mirrorNode of this.remoteConfig.configuration.state.mirrorNodes) {
      const context: Context | undefined = this.remoteConfig.getClusterRefs().get(mirrorNode.metadata.cluster);
      if (!context) {
        notes.push(`No cluster context found for mirror node ${mirrorNode.metadata.id}`);
        continue;
      }

      const namespace: NamespaceName = NamespaceName.of(mirrorNode.metadata.namespace);
      const k8: K8 = this.k8Factory.getK8(context);
      const postgresPods: Pod[] = await k8.pods().list(namespace, [constants.SOLO_MIRROR_POSTGRES_NAME_LABEL]);
      if (postgresPods.length === 0) {
        notes.push(`No mirror postgres pod found in ${namespace} (${context})`);
        continue;
      }

      const postgresPod: Pod = postgresPods[0];
      try {
        const credentials: {owner: string; ownerPassword: string; databaseName: string} =
          await this.getMirrorImporterDbCredentials(k8, namespace);
        const postgresContainerReference: ContainerReference = ContainerReference.of(
          postgresPod.podReference,
          ContainerName.of('postgresql'),
        );

        const queryOutput: string = await k8
          .containers()
          .readByRef(postgresContainerReference)
          .execContainer([
            'psql',
            `postgresql://${credentials.owner}:${credentials.ownerPassword}@localhost:5432/${credentials.databaseName}`,
            '-tA',
            '-F',
            '|',
            '-v',
            'ON_ERROR_STOP=1',
            '-c',
            'SELECT COALESCE(MIN(index), -1), COALESCE(MAX(index), -1) FROM record_file;',
          ]);
        const range: BlockNumberRange = this.parseRangeOutput(queryOutput);

        samples.push({
          componentId: `mirror-${mirrorNode.metadata.id}`,
          context,
          namespace: namespace.toString(),
          podName: postgresPod.podReference.name.toString(),
          first: range.first,
          last: range.last,
          source: 'mirror postgres record_file.index',
        });
      } catch (error) {
        notes.push(
          `Failed reading mirror importer range for mirror-${mirrorNode.metadata.id}/${postgresPod.podReference.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return samples;
  }

  private async getMirrorImporterDbCredentials(
    k8: K8,
    namespace: NamespaceName,
  ): Promise<{owner: string; ownerPassword: string; databaseName: string}> {
    const mirrorPasswordsSecret: Secret = await k8.secrets().read(namespace, 'mirror-passwords');
    const ownerKey: string | undefined = Object.keys(mirrorPasswordsSecret.data).find((key: string): boolean =>
      key.endsWith('_MIRROR_IMPORTER_DB_OWNER'),
    );
    if (!ownerKey) {
      throw new SoloError('Could not find MIRROR_IMPORTER_DB_OWNER in mirror-passwords secret.');
    }

    const environmentVariablePrefix: string = ownerKey.replace('_MIRROR_IMPORTER_DB_OWNER', '');
    return {
      owner: Base64.decode(mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNER`]),
      ownerPassword: Base64.decode(
        mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_OWNERPASSWORD`],
      ),
      databaseName: Base64.decode(mirrorPasswordsSecret.data[`${environmentVariablePrefix}_MIRROR_IMPORTER_DB_NAME`]),
    };
  }

  private parseRangeOutput(output: string): BlockNumberRange {
    const lines: string[] = output.trim().split('\n');
    let line: string = output.trim();
    for (let index: number = lines.length - 1; index >= 0; index--) {
      const currentLine: string = lines[index];
      if (currentLine.includes('|')) {
        line = currentLine;
        break;
      }
    }

    const [firstRaw, lastRaw]: string[] = line.split('|', 2);
    return {
      first: this.parseNullableBlockNumber(firstRaw),
      last: this.parseNullableBlockNumber(lastRaw),
    };
  }

  private parseNullableBlockNumber(value: string): number | null {
    if (!value) {
      return null;
    }

    const normalized: string = value.trim();
    if (!normalized || normalized === '-1') {
      return null;
    }

    const parsed: number = Number.parseInt(normalized, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  private extractBlockNumbersFromText(text: string): number[] {
    const values: number[] = [];
    const filePattern: RegExp = /\b(\d{1,19})\.blk(?:\.gz)?\b/g;
    let match: RegExpExecArray | null;

    while ((match = filePattern.exec(text)) !== null) {
      const parsed: number = Number.parseInt(match[1], 10);
      if (Number.isSafeInteger(parsed)) {
        values.push(parsed);
      }
    }

    return [...new Set(values)];
  }

  private toRange(values: number[]): BlockNumberRange {
    if (values.length === 0) {
      return {first: null, last: null};
    }

    // eslint-disable-next-line unicorn/no-array-sort
    const sorted: number[] = [...values].sort((left: number, right: number): number => left - right);
    return {first: sorted[0], last: sorted.at(-1) ?? null};
  }

  private aggregateBlockNumberSamples(samples: BlockNumberSample[]): BlockNumberRange {
    const firstValues: number[] = samples
      .map((sample: BlockNumberSample): number | null => sample.first)
      .filter((value: number | null): value is number => value !== null);
    const lastValues: number[] = samples
      .map((sample: BlockNumberSample): number | null => sample.last)
      .filter((value: number | null): value is number => value !== null);

    return {
      first: firstValues.length > 0 ? Math.min(...firstValues) : null,
      last: lastValues.length > 0 ? Math.max(...lastValues) : null,
    };
  }

  private logLedgerResetCheckpointSummary(snapshot: LedgerResetCheckpointSnapshot): void {
    const consensusRange: BlockNumberRange = this.aggregateBlockNumberSamples(snapshot.consensusSamples);
    const blockNodeRange: BlockNumberRange = this.aggregateBlockNumberSamples(snapshot.blockNodeSamples);
    const mirrorImporterRange: BlockNumberRange = this.aggregateBlockNumberSamples(snapshot.mirrorImporterSamples);

    if (snapshot.phase === 'pre-reset') {
      this.logger.showUser(
        `[ledger-reset-debug][pre-reset] consensus last block generated=${this.formatBlockNumber(consensusRange.last)}, block node last block handled=${this.formatBlockNumber(blockNodeRange.last)}, mirror importer last block imported=${this.formatBlockNumber(mirrorImporterRange.last)}`,
      );
    } else {
      this.logger.showUser(
        `[ledger-reset-debug][post-reset] consensus first block generated=${this.formatBlockNumber(consensusRange.first)}, block node first block handled=${this.formatBlockNumber(blockNodeRange.first)}, mirror importer first block imported=${this.formatBlockNumber(mirrorImporterRange.first)}`,
      );
    }

    for (const sample of [
      ...snapshot.consensusSamples,
      ...snapshot.blockNodeSamples,
      ...snapshot.mirrorImporterSamples,
    ]) {
      this.logger.showUser(
        `[ledger-reset-debug][${snapshot.phase}] ${sample.componentId} pod=${sample.podName} source=${sample.source} first=${this.formatBlockNumber(sample.first)} last=${this.formatBlockNumber(sample.last)}`,
      );
    }

    for (const note of snapshot.notes) {
      this.logger.warn(`[ledger-reset-debug][${snapshot.phase}] ${note}`);
    }
  }

  private formatBlockNumber(value: number | null): string {
    return value === null ? 'N/A' : value.toString();
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
          task: async (_context_: Context, task: SoloListrTaskWrapper<Context>): Promise<Listr<Context>> => {
            const subTasks: SoloListrTask<Context>[] = [];
            const accountsToCreate: PredefinedAccount[] = [...predefinedEcdsaAccountsWithAlias];

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
