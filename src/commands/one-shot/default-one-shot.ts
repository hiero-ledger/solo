// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../../core/errors/solo-error.js';
import * as constants from '../../core/constants.js';
import {BaseCommand} from '../base.js';
import {Flags as flags} from '../flags.js';
import {type ArgvStruct, type NodeAlias} from '../../types/aliases.js';
import {type DeploymentName, type Optional, type SoloListr} from '../../types/index.js';
import {type CommandFlags} from '../../types/flag-types.js';
import {inject, injectable} from 'tsyringe-neo';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {OneShotCommand} from './one-shot.js';
import {type OneShotSingleDeployConfigClass} from './one-shot-single-deploy-config-class.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import chalk from 'chalk';
import {PathEx} from '../../business/utils/path-ex.js';
import yaml from 'yaml';
import {optionFromFlag} from '../command-helpers.js';
import {ConfigMap} from '../../integration/kube/resources/config-map/config-map.js';
import {type K8} from '../../integration/kube/k8.js';
import {Templates} from '../../core/templates.js';
import {type Lock} from '../../core/lock/lock.js';
import {type OneShotDeployOrchestrator} from './orchestrator/deploy/one-shot-deploy-orchestrator.js';
import {type OneShotDestroyOrchestrator} from './orchestrator/destroy/one-shot-destroy-orchestrator.js';
import {type DeploymentSchema} from '../../data/schema/model/local/deployment-schema.js';
import {Deployment} from '../../business/runtime-state/config/local/deployment.js';
import {MutableFacadeArray} from '../../business/runtime-state/collection/mutable-facade-array.js';
import {StringFacade} from '../../business/runtime-state/facade/string-facade.js';
import {type DeploymentStateSchema} from '../../data/schema/model/remote/deployment-state-schema.js';
import {OneShotInfoContext} from './one-shot-info-context.js';
import {type ApplicationVersionsSchema} from '../../data/schema/model/common/application-versions-schema.js';

@injectable()
export class DefaultOneShotCommand extends BaseCommand implements OneShotCommand {
  private _isRollback: boolean = false;

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.quiet,
      flags.force,
      flags.deployment,
      flags.namespace,
      flags.clusterRef,
      flags.minimalSetup,
      flags.rollback,
      flags.parallelDeploy,
      flags.externalAddress,
      flags.edgeEnabled,
    ],
  };

  public static readonly MULTI_DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [...DefaultOneShotCommand.DEPLOY_FLAGS_LIST.optional, flags.numberOfConsensusNodes],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.deployment],
  };

  public static readonly FALCON_DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.quiet,
      flags.force,
      flags.valuesFile,
      flags.numberOfConsensusNodes,
      flags.deployment,
      flags.namespace,
      flags.clusterRef,
      flags.deployMirrorNode,
      flags.deployExplorer,
      flags.deployRelay,
      flags.deployMetricsServer,
      flags.rollback,
      flags.parallelDeploy,
      flags.externalAddress,
      flags.edgeEnabled,
    ],
  };

  public static readonly FALCON_DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [...DefaultOneShotCommand.DESTROY_FLAGS_LIST.optional],
  };

  public static readonly INFO_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.deployment],
  };

  public constructor(
    @inject(InjectTokens.OneShotDeployOrchestrator)
    private readonly deployOrchestrator: OneShotDeployOrchestrator,
    @inject(InjectTokens.OneShotDestroyOrchestrator)
    private readonly destroyOrchestrator: OneShotDestroyOrchestrator,
  ) {
    super();
    this.deployOrchestrator = patchInject(
      deployOrchestrator,
      InjectTokens.OneShotDeployOrchestrator,
      this.constructor.name,
    );
    this.destroyOrchestrator = patchInject(
      destroyOrchestrator,
      InjectTokens.OneShotDestroyOrchestrator,
      this.constructor.name,
    );
  }

  public async deploy(argv: ArgvStruct): Promise<boolean> {
    return this.deployInternal(argv, DefaultOneShotCommand.DEPLOY_FLAGS_LIST);
  }

  public async deployFalcon(argv: ArgvStruct): Promise<boolean> {
    return this.deployInternal(argv, DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST);
  }

  private async performRollback(
    deployError: Error,
    config: OneShotSingleDeployConfigClass | undefined,
  ): Promise<never> {
    if (!config) {
      throw new SoloError(
        `Deploy failed: ${deployError.message}. Rollback skipped: no resources created.`,
        deployError,
      );
    }

    if (config.rollback === false) {
      this.logger.warn('Automatic rollback skipped (--no-rollback flag provided)');
      this.logger.warn('To clean up: solo one-shot single destroy');
      this.logger.warn(`Or: kubectl delete ns ${config.namespace.name}`);
      throw new SoloError(`Deploy failed: ${deployError.message}. Rollback skipped (--no-rollback).`, deployError);
    }

    this.logger.warn(
      `Deploy failed. Starting automatic rollback for deployment '${config.deployment}' in namespace '${config.namespace.name}'...`,
    );

    const destroyArgv: ArgvStruct = {
      _: [],
      deployment: config.deployment,
      clusterRef: config.clusterRef,
      namespace: config.namespace.name,
      context: config.context,
      quiet: true,
    };

    this._isRollback = true;
    try {
      await this.destroyInternal(destroyArgv, DefaultOneShotCommand.DESTROY_FLAGS_LIST);
    } catch (rollbackError) {
      this.logger.error(`Rollback failed for deployment '${config.deployment}': ${rollbackError.message}`);
      throw new SoloError(
        `Deploy failed: ${deployError.message}. Rollback also failed: ${rollbackError.message}`,
        deployError,
      );
    } finally {
      // Safety net: ensure namespace is always deleted during rollback, even if destroyInternal
      // failed or skipped namespace cleanup (e.g. due to skipAll, helm uninstall failure, etc.)
      try {
        const k8: K8 = this.k8Factory.getK8(config.context);
        if (await k8.namespaces().has(config.namespace)) {
          this.logger.warn(`Rollback cleanup: deleting namespace '${config.namespace.name}'`);
          await k8.namespaces().delete(config.namespace);
        }
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to delete namespace '${config.namespace.name}' during rollback cleanup: ${cleanupError.message}`,
        );
      }

      this._isRollback = false;
    }

    this.logger.info(`Rollback complete. Cache preserved at: ${config.cacheDir}`);
    throw new SoloError(`Deploy failed: ${deployError.message}. Rollback completed successfully.`, deployError);
  }

  private async deployInternal(argv: ArgvStruct, flagsList: CommandFlags): Promise<boolean> {
    const leaseReference: {value?: Lock} = {};
    const configReference: {value?: OneShotSingleDeployConfigClass} = {};
    try {
      await this.deployOrchestrator.buildDeployPipeline(argv, flagsList, leaseReference, configReference).run();
    } catch (error) {
      await this.performRollback(error, configReference.value);
    } finally {
      this.oneShotState.deactivate();
      const cleanupPromises: Promise<void>[] = [];
      if (leaseReference.value) {
        cleanupPromises.push(
          leaseReference.value.release(true).catch((error): void => {
            this.logger.error('Error releasing one-shot lease:', error);
          }),
        );
      }
      cleanupPromises.push(
        this.taskList
          .callCloseFunctions()
          .then()
          .catch((error): void => {
            this.logger.error('Error during closing task list:', error);
          }),
      );
      await Promise.all(cleanupPromises);
    }
    return true;
  }

  private getOneShotOutputDirectory(deploymentName: string): string {
    return PathEx.join(constants.SOLO_HOME_DIR, `one-shot-${deploymentName}`);
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    return this.destroyInternal(argv, DefaultOneShotCommand.DESTROY_FLAGS_LIST);
  }

  public async destroyFalcon(argv: ArgvStruct): Promise<boolean> {
    return this.destroyInternal(argv, DefaultOneShotCommand.FALCON_DESTROY_FLAGS_LIST);
  }

  private async destroyInternal(argv: ArgvStruct, flagsList: CommandFlags): Promise<boolean> {
    const leaseReference: {value?: Lock} = {};
    try {
      await this.destroyOrchestrator.buildDestroyPipeline(argv, flagsList, leaseReference).run();
    } catch (error) {
      throw new SoloError(`Error destroying Solo in one-shot mode: ${error.message}`, error);
    } finally {
      this.oneShotState.deactivate();
      const cleanupPromises: Promise<void>[] = [];
      if (leaseReference.value) {
        cleanupPromises.push(
          leaseReference.value.release(true).catch((error): void => {
            this.logger.error('Error releasing one-shot lease:', error);
          }),
        );
      }
      cleanupPromises.push(
        this.taskList
          .callCloseFunctions()
          .then()
          .catch((error): void => this.logger.error('Error during closing task list:', error)),
      );
      await Promise.all(cleanupPromises);
    }
    return true;
  }

  public async info(): Promise<boolean> {
    const tasks: SoloListr<OneShotInfoContext> = new Listr(
      [
        {
          title: 'Check for cached deployment',
          task: async (context_): Promise<void> => {
            const deploymentFromFlag: DeploymentName = this.configManager.getFlag(flags.deployment);
            if (deploymentFromFlag) {
              context_.deploymentName = deploymentFromFlag;
              this.logger.showUser(chalk.cyan(`\nDeployment Name: ${chalk.bold(deploymentFromFlag)} (from flag)`));
              return;
            }

            const cacheFile: string = PathEx.join(constants.SOLO_CACHE_DIR, 'last-one-shot-deployment.txt');

            if (fs.existsSync(cacheFile)) {
              const deploymentName: string = fs.readFileSync(cacheFile, 'utf8').trim();
              if (deploymentName) {
                context_.deploymentName = deploymentName;
                this.logger.showUser(chalk.cyan(`\nDeployment Name: ${chalk.bold(deploymentName)} (from cache)`));
                return;
              }
            }

            await this.localConfig.load();
            const deployments: MutableFacadeArray<Deployment, DeploymentSchema> =
              this.localConfig.configuration.deployments;
            if (deployments.length === 1) {
              context_.deploymentName = deployments.get(0).name;
              this.logger.showUser(
                chalk.cyan(`\nDeployment Name: ${chalk.bold(context_.deploymentName)} (single local deployment)`),
              );
              return;
            }

            if (deployments.length > 1) {
              const deploymentNames: string = deployments.map((d): string => d.name).join(', ');
              throw new SoloError(
                'No cached deployment found and multiple local deployments exist.\n' +
                  `Please specify ${optionFromFlag(flags.deployment)}.\n` +
                  `Available deployments: ${deploymentNames}`,
              );
            }

            throw new SoloError(
              'No cached deployment found. Please run a one-shot deployment first or pass ' +
                `${optionFromFlag(flags.deployment)}.\n` +
                `Expected cache file: ${cacheFile}`,
            );
          },
        },
        {
          title: 'Load local configuration',
          task: async (context_): Promise<void> => {
            await this.localConfig.load();

            const deployment: Deployment = this.localConfig.configuration.deployments.find(
              (d): boolean => d.name === context_.deploymentName,
            );

            if (!deployment) {
              this.logger.showUser(
                chalk.yellow(
                  `\n⚠️  Deployment '${context_.deploymentName}' not found in local configuration.\n` +
                    'This may be a deployment that was created but not properly registered.',
                ),
              );
              return;
            }

            context_.deployment = deployment;
            this.logger.showUser(chalk.cyan(`\nNamespace: ${chalk.bold(deployment.namespace)}`));

            if (deployment.clusters && deployment.clusters.length > 0) {
              const clusterNames: string = deployment.clusters.map((c): string => c.toString()).join(', ');
              this.logger.showUser(chalk.cyan(`Clusters: ${chalk.bold(clusterNames)}`));
            }
          },
        },
        {
          title: 'Check cluster connectivity',
          task: async (context_, task): Promise<void> => {
            if (!context_.deployment) {
              task.skip('No deployment configuration found');
              return;
            }

            const deployment: Deployment = context_.deployment;
            if (!deployment.clusters || deployment.clusters.length === 0) {
              this.logger.showUser(chalk.yellow('\n⚠️  No clusters attached to this deployment.'));
              return;
            }

            const clusterReference: string = deployment.clusters.get(0).toString();
            const clusterContext: StringFacade | undefined =
              this.localConfig.configuration.clusterRefs.get(clusterReference);

            if (!clusterContext) {
              this.logger.showUser(
                chalk.yellow(`\n⚠️  Cluster reference '${clusterReference}' not found in configuration.`),
              );
              return;
            }

            try {
              this.k8Factory.default().contexts().updateCurrent(clusterContext.toString());
              const namespaces: NamespaceName[] = await this.k8Factory.default().namespaces().list();
              const targetNamespace: NamespaceName = namespaces.find((ns): boolean => ns.name === deployment.namespace);

              if (!targetNamespace) {
                this.logger.showUser(
                  chalk.yellow(
                    `\n⚠️  Namespace '${deployment.namespace}' not found in cluster '${clusterReference}'.` +
                      '\nThe deployment may have been destroyed or is not accessible.',
                  ),
                );
                return;
              }

              context_.clusterConnected = true;
            } catch (error) {
              this.logger.showUser(
                chalk.yellow(`\n⚠️  Unable to connect to cluster '${clusterReference}'.\n` + `Error: ${error.message}`),
              );
            }
          },
        },
        {
          title: 'Fetch deployment state',
          task: async (context_, task): Promise<void> => {
            if (!context_.clusterConnected || !context_.deployment) {
              task.skip('Cluster not accessible or no deployment configuration');
              return;
            }

            const deployment: Deployment = context_.deployment;

            try {
              const namespaceName: NamespaceName = NamespaceName.of(deployment.namespace);
              const configMaps: ConfigMap[] = await this.k8Factory.default().configMaps().list(namespaceName, []);

              const remoteConfigMap: Optional<ConfigMap> = configMaps.find(
                (cm): boolean => cm.name === constants.SOLO_REMOTE_CONFIGMAP_NAME,
              );

              if (!remoteConfigMap) {
                this.logger.showUser(
                  chalk.yellow(
                    `\n⚠️  Remote configuration not found in namespace '${deployment.namespace}'.` +
                      '\nThe deployment may have been partially destroyed.',
                  ),
                );
                return;
              }

              context_.remoteConfig = yaml.parse(remoteConfigMap.data[constants.SOLO_REMOTE_CONFIGMAP_DATA_KEY]);
            } catch (error) {
              this.logger.showUser(chalk.yellow(`\n⚠️  Unable to fetch remote configuration: ${error.message}`));
            }
          },
        },
        {
          title: 'Display deployment information',
          task: async (context_): Promise<void> => {
            this.logger.showUser(chalk.cyan('\n=== Deployment Components ==='));

            const versions: ApplicationVersionsSchema = context_.remoteConfig.versions;

            // Show versions
            this.logger.showUser(chalk.cyan('\nVersions:'));
            this.logger.showUser(`  Solo Chart Version: ${chalk.bold(versions.chart?.toString())}`);
            this.logger.showUser(`  Consensus Node Version: ${chalk.bold(versions.consensusNode?.toString())}`);
            this.logger.showUser(`  Mirror Node Version: ${chalk.bold(versions.mirrorNodeChart?.toString())}`);
            this.logger.showUser(`  Explorer Version: ${chalk.bold(versions.explorerChart?.toString())}`);
            this.logger.showUser(`  JSON RPC Relay Version: ${chalk.bold(versions.jsonRpcRelayChart?.toString())}`);
            this.logger.showUser(`  Block Node Version: ${chalk.bold(versions.blockNodeChart?.toString())}`);

            if (context_.remoteConfig) {
              const components: DeploymentStateSchema = context_.remoteConfig.state;

              if (components) {
                this.logger.showUser(chalk.cyan('\nDeployed Components:'));

                if (components.consensusNodes && components.consensusNodes.length > 0) {
                  const nodeNames: string = components.consensusNodes
                    .map((n): NodeAlias => Templates.renderNodeAliasFromNumber(n.metadata.id))
                    .join(', ');

                  this.logger.showUser(
                    `  ${chalk.green('✓')} Consensus Nodes: ${chalk.bold(components.consensusNodes.length)} (${nodeNames})`,
                  );
                }

                if (components.mirrorNodes && components.mirrorNodes.length > 0) {
                  this.logger.showUser(
                    `  ${chalk.green('✓')} Mirror Nodes: ${chalk.bold(components.mirrorNodes.length)}`,
                  );
                }

                if (components.blockNodes && components.blockNodes.length > 0) {
                  this.logger.showUser(
                    `  ${chalk.green('✓')} Block Nodes: ${chalk.bold(components.blockNodes.length)}`,
                  );
                }

                if (components.relayNodes && components.relayNodes.length > 0) {
                  this.logger.showUser(
                    `  ${chalk.green('✓')} Relay Nodes: ${chalk.bold(components.relayNodes.length)}`,
                  );
                }

                if (components.explorers && components.explorers.length > 0) {
                  this.logger.showUser(`  ${chalk.green('✓')} Explorers: ${chalk.bold(components.explorers.length)}`);
                }

                if (components.postgres && components.postgres.length > 0) {
                  this.logger.showUser(`  ${chalk.green('✓')} Postgres: ${chalk.bold(components.postgres.length)}`);
                }

                if (components.redis && components.redis.length > 0) {
                  this.logger.showUser(`  ${chalk.green('✓')} Redis: ${chalk.bold(components.redis.length)}`);
                }
              }
            } else {
              this.logger.showUser(
                chalk.yellow('\n⚠️  Remote configuration not available. Cannot display deployed components.'),
              );
            }

            // Show information about where files are stored
            const outputDirectory: string = this.getOneShotOutputDirectory(context_.deploymentName);

            this.logger.showUser(chalk.cyan('\n=== Deployment Files ==='));

            if (fs.existsSync(outputDirectory)) {
              this.logger.showUser(`Output directory: ${chalk.bold(outputDirectory)}`);

              const notesFile: string = PathEx.join(outputDirectory, 'notes');
              const versionsFile: string = PathEx.join(outputDirectory, 'versions');
              const forwardsFile: string = PathEx.join(outputDirectory, 'forwards');
              const accountsFile: string = PathEx.join(outputDirectory, 'accounts.json');

              if (fs.existsSync(notesFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Notes: ${notesFile}`);
              }
              if (fs.existsSync(versionsFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Versions: ${versionsFile}`);
              }
              if (fs.existsSync(forwardsFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Port forwards: ${forwardsFile}`);
              }
              if (fs.existsSync(accountsFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Accounts: ${accountsFile}`);
              }
            } else {
              this.logger.showUser(chalk.yellow(`\n⚠️  Output directory not found: ${outputDirectory}`));
            }

            this.logger.showUser(chalk.green('\n✓ Deployment information retrieved successfully.\n'));
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error retrieving deployment information: ${error.message}`, error);
    }

    return true;
  }

  public async close(): Promise<void> {} // no-op
}
