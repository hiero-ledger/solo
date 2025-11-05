// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {
  type ClusterReferenceName,
  type DeploymentName,
  type Optional,
  type SoloListr,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {injectable} from 'tsyringe-neo';
import {NETWORK_LOAD_GENERATOR_CHART_VERSION} from '../../version.js';
import * as helpers from '../core/helpers.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {Containers} from '../integration/kube/resources/container/containers.js';
import {Container} from '../integration/kube/resources/container/container.js';
import chalk from 'chalk';
import {PassThrough} from 'node:stream';

interface RapidFireStartConfigClass {
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  devMode: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  namespace: NamespaceName;
  context: string;
  valuesArg: string;
  nlgArguments: string;
  parsedNlgArguments: string;
  javaHeap: number;
  performanceTest: string;
  packageName: string;
}

interface RapidFireStopConfigClass {
  deployment: DeploymentName;
  devMode: boolean;
  quiet: boolean;
  namespace: NamespaceName;
  context: string;
  clusterRef: ClusterReferenceName;
  performanceTest: string;
  packageName: string;
}

interface RapidFireStartContext {
  config: RapidFireStartConfigClass;
}

interface RapidFireStopContext {
  config: RapidFireStopConfigClass;
}

export enum NLGTestClass {
  HCSLoadTest = 'HCSLoadTest',
  CryptoTransferLoadTest = 'CryptoTransferLoadTest',
  NftTransferLoadTest = 'NftTransferLoadTest',
  TokenTransferLoadTest = 'TokenTransferLoadTest',
  SmartContractLoadTest = 'SmartContractLoadTest',
  HeliSwapLoadTest = 'HeliSwapLoadTest',
  LongevityLoadTest = 'LongevityLoadTest',
}

@injectable()
export class RapidFireCommand extends BaseCommand {
  public constructor() {
    super();
  }

  private static readonly CRYPTO_TRANSFER_START_CONFIG_NAME: string = 'cryptoTransferStartConfig';
  private static readonly STOP_CONFIG_NAME: string = 'stopConfig';

  public static readonly START_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment, flags.nlgArguments, flags.performanceTest],
    optional: [flags.devMode, flags.force, flags.quiet, flags.valuesFile, flags.javaHeap, flags.packageName],
  };

  public static readonly STOP_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment, flags.performanceTest],
    optional: [flags.devMode, flags.force, flags.quiet, flags.packageName],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.devMode, flags.force, flags.quiet],
  };

  private nglChartIsDeployed(context_: RapidFireStartContext): Promise<boolean> {
    return this.chartManager.isChartInstalled(
      context_.config.namespace,
      constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
      context_.config.context,
    );
  }

  private deployNlgChart(): SoloListrTask<RapidFireStartContext> {
    return {
      title: 'Deploy Network Load Generator chart',
      task: (context_, task): SoloListr<RapidFireStartContext> => {
        const subTasks: SoloListrTask<RapidFireStartContext>[] = [
          {
            title: 'Install Network Load Generator chart',
            task: async (context_, task): Promise<void> => {
              let valuesArgument: string = helpers.prepareValuesFiles(constants.RAPID_FIRE_VALUES_FILE);

              if (context_.config.valuesFile) {
                valuesArgument += helpers.prepareValuesFiles(context_.config.valuesFile);
              }

              const haproxyPods: Pod[] = await this.k8Factory
                .getK8(context_.config.context)
                .pods()
                .list(context_.config.namespace, ['solo.hedera.com/type=haproxy']);

              let port: number = constants.GRPC_PORT;
              const networkProperties: string[] = haproxyPods.map((pod: Pod) => {
                const accountId = pod.labels['solo.hedera.com/account-id'] ?? 'unknown';
                // Using multiple backslashes to ensure it is not stripped when the network.properties file is generated
                // Final result should look like: x.x.x.x\:50211=0.0.y
                return String.raw`${pod.podIp}\\\:${port++}=${accountId}`;
              });

              for (const row of networkProperties) {
                valuesArgument += ` --set loadGenerator.properties[${networkProperties.indexOf(row)}]="${row}"`;
              }

              await this.chartManager.install(
                context_.config.namespace,
                constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
                constants.NETWORK_LOAD_GENERATOR_CHART,
                constants.NETWORK_LOAD_GENERATOR_CHART_URL,
                NETWORK_LOAD_GENERATOR_CHART_VERSION,
                valuesArgument,
                context_.config.context,
              );
            },
          },
          {
            title: 'Check NLG pod is ready',
            task: async ({config}): Promise<void> => {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  constants.NETWORK_LOAD_GENERATOR_POD_LABELS,
                  constants.NETWORK_LOAD_GENERATOR_POD_RUNNING_MAX_ATTEMPTS,
                  constants.NETWORK_LOAD_GENERATOR_POD_RUNNING_DELAY,
                );
            },
          },
          {
            title: 'Install libraries in NLG pod',
            task: async ({config}): Promise<void> => {
              const nlgPods: Pod[] = await this.k8Factory
                .getK8(config.context)
                .pods()
                .list(config.namespace, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);
              const k8Containers: Containers = this.k8Factory.getK8(config.context).containers();

              for (const pod of nlgPods) {
                const containerReference = ContainerReference.of(
                  pod.podReference,
                  constants.NETWORK_LOAD_GENERATOR_CONTAINER,
                );
                const container: Container = k8Containers.readByRef(containerReference);
                await container.execContainer('apt-get update -qq');
                await container.execContainer('apt-get install -y libsodium23');
                await container.execContainer('apt-get clean -qq');
              }
            },
          },
        ];

        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
          rendererOptions: {
            collapseSubtasks: false,
          },
        });
      },
      skip: this.nglChartIsDeployed.bind(this),
    };
  }

  private startLoadTest(leaseReference: {lease?: Lock}): SoloListrTask<RapidFireStartContext> {
    return {
      title: `Start performance load test`,
      task: async (
        context_: RapidFireStartContext,
        task: SoloListrTaskWrapper<RapidFireStartContext>,
      ): Promise<void> => {
        const {performanceTest, packageName} = context_.config;
        const testClass: string = `${packageName}.${performanceTest}`;
        task.title = `Start performance load test: ${testClass}`;
        const nlgPods: Pod[] = await this.k8Factory
          .getK8(context_.config.context)
          .pods()
          .list(context_.config.namespace, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);
        const k8Containers: Containers = this.k8Factory.getK8(context_.config.context).containers();

        for (const pod of nlgPods) {
          const containerReference = ContainerReference.of(
            pod.podReference,
            constants.NETWORK_LOAD_GENERATOR_CONTAINER,
          );
          const container: Container = k8Containers.readByRef(containerReference);
          const outputStream: PassThrough = new PassThrough();
          outputStream.on('data', (chunk: Buffer) => {
            const string_: string = chunk.toString();
            task.output = (task.output || '') + chalk.gray(string_);
          });

          try {
            await leaseReference.lease?.release();
            await container.execContainer(
              `/usr/bin/env java -Xmx${context_.config.javaHeap}g -cp /app/lib/*:/app/network-load-generator-${NETWORK_LOAD_GENERATOR_CHART_VERSION}.jar ${testClass} ${context_.config.parsedNlgArguments}`,
              outputStream,
            );
          } catch (error) {
            throw new SoloError(`Error running ${testClass} load test: ${error.message}`, error);
          }

          if (task.output) {
            const showOutput: string = '>   ' + task.output.replaceAll('\n', '\n    ');
            this.logger.showUser(showOutput);
          }
        }
      },
    };
  }

  public async start(argv: ArgvStruct): Promise<boolean> {
    const leaseReference: {lease?: Lock} = {}; // This allows the lease to be passed by reference to the init task

    const tasks: Listr<RapidFireStartContext> = new Listr<RapidFireStartContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            leaseReference.lease = await this.leaseManager.create();

            this.configManager.update(argv);

            flags.disablePrompts(RapidFireCommand.START_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...RapidFireCommand.START_FLAGS_LIST.required,
              ...RapidFireCommand.START_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: RapidFireStartConfigClass = this.configManager.getConfig(
              RapidFireCommand.CRYPTO_TRANSFER_START_CONFIG_NAME,
              allFlags,
              ['parsedNlgArguments'],
            ) as RapidFireStartConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);

            // Parse nlgArguments to remove any surrounding quotes
            config.parsedNlgArguments = config.nlgArguments.replaceAll("'", '').replaceAll('"', '');

            return ListrLock.newAcquireLockTask(leaseReference.lease, task);
          },
        },
        this.deployNlgChart(),
        this.startLoadTest(leaseReference),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error running rapid-fire: ${error.message}`, error);
    } finally {
      await leaseReference.lease?.release();
    }

    return true;
  }

  private stopInitializeTask(argv: ArgvStruct, leaseReference: {lease?: Lock}): SoloListrTask<RapidFireStopContext> {
    return {
      title: 'Initialize',
      task: async (context_, task): Promise<Listr<AnyListrContext>> => {
        await this.localConfig.load();
        await this.remoteConfig.loadAndValidate(argv);
        leaseReference.lease = await this.leaseManager.create();

        this.configManager.update(argv);

        flags.disablePrompts(RapidFireCommand.STOP_FLAGS_LIST.optional);

        const allFlags: CommandFlag[] = [
          ...RapidFireCommand.STOP_FLAGS_LIST.required,
          ...RapidFireCommand.STOP_FLAGS_LIST.optional,
        ];

        await this.configManager.executePrompt(task, allFlags);

        const config: RapidFireStopConfigClass = this.configManager.getConfig(
          RapidFireCommand.STOP_CONFIG_NAME,
          allFlags,
        ) as RapidFireStopConfigClass;

        config.namespace = await this.getNamespace(task);
        config.clusterRef = this.getClusterReference();
        config.context = this.getClusterContext(config.clusterRef);
        context_.config = config;

        return ListrLock.newAcquireLockTask(leaseReference.lease, task);
      },
    };
  }

  private async allStopTasks(argv: ArgvStruct, stopTask: SoloListrTask<RapidFireStopContext>): Promise<boolean> {
    const leaseReference: {lease?: Lock} = {}; // This allows the lease to be passed by reference to the init task
    const tasks: Listr<RapidFireStopContext> = new Listr<RapidFireStopContext>(
      [this.stopInitializeTask(argv, leaseReference), stopTask],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error running rapid-fire stop: ${error.message}`, error);
    } finally {
      if (leaseReference.lease) {
        await leaseReference.lease.release();
      }
    }

    return true;
  }

  private stopLoadTest(): SoloListrTask<RapidFireStopContext> {
    return {
      title: 'Stop load test',
      task: async (context_: RapidFireStopContext, task: SoloListrTaskWrapper<RapidFireStopContext>): Promise<void> => {
        const {performanceTest, packageName} = context_.config;
        const testClass: string = `${packageName}.${performanceTest}`;
        task.title = `Stop load test: ${testClass}`;
        const nlgPods: Pod[] = await this.k8Factory
          .getK8(context_.config.context)
          .pods()
          .list(context_.config.namespace, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);
        const k8Containers: Containers = this.k8Factory.getK8(context_.config.context).containers();

        for (const pod of nlgPods) {
          const containerReference = ContainerReference.of(
            pod.podReference,
            constants.NETWORK_LOAD_GENERATOR_CONTAINER,
          );
          const container: Container = k8Containers.readByRef(containerReference);
          try {
            await container.execContainer(`pkill -f ${testClass}`);
          } catch (error) {
            throw new SoloError(`Error stopping ${testClass} load test: ${error.message}`, error);
          }
        }
      },
    };
  }

  public async stop(argv: ArgvStruct): Promise<boolean> {
    const leaseReference: {lease?: Lock} = {}; // This allows the lease to be passed by reference to the init task
    const tasks: Listr<RapidFireStopContext> = new Listr<RapidFireStopContext>(
      [this.stopInitializeTask(argv, leaseReference), this.stopLoadTest()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error running rapid-fire stop: ${error.message}`, error);
    } finally {
      if (leaseReference.lease) {
        await leaseReference.lease.release();
      }
    }

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    return this.allStopTasks(argv, {
      title: 'Uninstall Network Load Generator chart',
      task: async (context_, task): Promise<void> => {
        await this.chartManager.uninstall(
          context_.config.namespace,
          constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
          context_.config.context,
        );
      },
    });
  }

  public async close(): Promise<void> {} // no-op
}
