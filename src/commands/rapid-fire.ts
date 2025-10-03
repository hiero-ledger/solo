// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {type ClusterReferenceName, type DeploymentName, type Optional} from '../types/index.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {injectable} from 'tsyringe-neo';
import {NETWORK_LOAD_GENERATOR_CHART_VERSION} from '../../version.js';
import * as helpers from '../core/helpers.js';

interface RapidFireCryptoTransferStartConfigClass {
  chartDirectory: string;
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  devMode: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  namespace: NamespaceName;
  context: string;
  valuesArg: string;
}

interface RapidFireStopConfigClass {
  deployment: DeploymentName;
  devMode: boolean;
  quiet: boolean;
  namespace: NamespaceName;
  context: string;
}

interface RapidFireCryptoTransferStartContext {
  config: RapidFireCryptoTransferStartConfigClass;
}

interface RapidFireStopContext {
  config: RapidFireStopConfigClass;
}

@injectable()
export class RapidFireCommand extends BaseCommand {
  public constructor() {
    super();
  }

  private static readonly CRYPTO_TRANSFER_START_CONFIG_NAME: string = 'cryptoTransferStartConfig';
  private static readonly STOP_CONFIG_NAME: string = 'stopConfig';

  public static readonly CRYPTO_TRANSFER_START_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.devMode, flags.force, flags.quiet, flags.valuesFile, flags.chartDirectory],
  };

  public static readonly STOP_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.devMode, flags.force, flags.quiet],
  };

  public async cryptoTransferStart(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: Listr<RapidFireCryptoTransferStartContext> = new Listr<RapidFireCryptoTransferStartContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();

            this.configManager.update(argv);

            flags.disablePrompts(RapidFireCommand.CRYPTO_TRANSFER_START_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...RapidFireCommand.CRYPTO_TRANSFER_START_FLAGS_LIST.required,
              ...RapidFireCommand.CRYPTO_TRANSFER_START_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: RapidFireCryptoTransferStartConfigClass = this.configManager.getConfig(
              RapidFireCommand.CRYPTO_TRANSFER_START_CONFIG_NAME,
              allFlags,
            ) as RapidFireCryptoTransferStartConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Install Network Load Generator chart',
          task: async (context_, task): Promise<void> => {
            const valuesArgument: string = helpers.prepareValuesFiles(constants.RAPID_FIRE_CRYPTO_TRANSFER_VALUES_FILE);

            await this.chartManager.install(
              context_.config.namespace,
              constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
              constants.NETWORK_LOAD_GENERATOR_CHART,
              constants.NETWORK_LOAD_GENERATOR_CHART_URL,
              NETWORK_LOAD_GENERATOR_CHART_VERSION, // TODO add flag to override
              valuesArgument,
              context_.config.context,
            );
          },
        },
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
      await lease?.release();
    }

    return true;
  }

  public async stop(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: Listr<RapidFireStopContext> = new Listr<RapidFireStopContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();

            this.configManager.update(argv);

            flags.disablePrompts(RapidFireCommand.STOP_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...RapidFireCommand.STOP_FLAGS_LIST.required,
              ...RapidFireCommand.STOP_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: RapidFireCryptoTransferStartConfigClass = this.configManager.getConfig(
              RapidFireCommand.STOP_CONFIG_NAME,
              allFlags,
            ) as RapidFireCryptoTransferStartConfigClass;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);
            context_.config = config;

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Install Network Load Generator chart',
          task: async (context_, task): Promise<void> => {
            await this.chartManager.uninstall(
              context_.config.namespace,
              constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
              context_.config.context,
            );
          },
        },
      ],
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
      await lease?.release();
    }

    return true;
  }

  public async close(): Promise<void> {} // no-op
}
