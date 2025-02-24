/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ClusterCommandTasks} from './tasks.js';
import * as helpers from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import * as ContextFlags from './flags.js';
import {ListrRemoteConfig} from '../../core/config/remote/listr_config_tasks.js';
import {type RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';
import {SoloError} from '../../core/errors.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency_injection/container_helper.js';
import {type K8Factory} from '../../core/kube/k8_factory.js';
import {CommandHandler} from '../../core/command_handler.js';
import {type LocalConfig} from '../../core/config/local_config.js';
import {InjectTokens} from '../../core/dependency_injection/inject_tokens.js';
import {type ClusterCommandConfigs} from './configs.js';

@injectable()
export class ClusterCommandHandlers extends CommandHandler {
  constructor(
    @inject(InjectTokens.ClusterCommandTasks) private readonly tasks: ClusterCommandTasks,
    @inject(InjectTokens.RemoteConfigManager) private readonly remoteConfigManager: RemoteConfigManager,
    @inject(InjectTokens.LocalConfig) private readonly localConfig: LocalConfig,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.ClusterCommandConfigs) private readonly configs: ClusterCommandConfigs,
  ) {
    super();

    this.tasks = patchInject(tasks, InjectTokens.ClusterCommandTasks, this.constructor.name);
    this.remoteConfigManager = patchInject(
      remoteConfigManager,
      InjectTokens.RemoteConfigManager,
      this.constructor.name,
    );
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.configs = patchInject(configs, InjectTokens.ClusterCommandConfigs, this.constructor.name);
  }

  async connect(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.commandActionBuilder(
      [
        this.tasks.initialize(argv, this.configs.connectConfigBuilder.bind(this.configs), this.getConfigMaps()),
        this.setupHomeDirectoryTask(),
        this.localConfig.promptLocalConfigTask(this.k8Factory),
        this.tasks.selectContext(),
        ListrRemoteConfig.loadRemoteConfig(this.remoteConfigManager, argv),
        this.tasks.readClustersFromRemoteConfig(argv),
        this.tasks.updateLocalConfig(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster connect',
      null,
    );

    await action(argv);
    return true;
  }

  async list(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.commandActionBuilder(
      [this.tasks.showClusterList()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster list',
      null,
    );

    await action(argv);
    return true;
  }

  async info(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.commandActionBuilder(
      [this.tasks.getClusterInfo()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster info',
      null,
    );

    await action(argv);
    return true;
  }

  async setup(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.commandActionBuilder(
      [
        this.tasks.initialize(argv, this.configs.setupConfigBuilder.bind(this.configs), this.getConfigMaps()),
        this.tasks.prepareChartValues(argv),
        this.tasks.installClusterChart(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster setup',
      null,
    );

    try {
      await action(argv);
    } catch (e: Error | any) {
      throw new SoloError('Error on cluster setup', e);
    }

    return true;
  }

  async reset(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.commandActionBuilder(
      [
        this.tasks.initialize(argv, this.configs.resetConfigBuilder.bind(this.configs), this.getConfigMaps()),
        this.tasks.acquireNewLease(argv),
        this.tasks.uninstallClusterChart(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster reset',
      null,
    );

    try {
      await action(argv);
    } catch (e: Error | any) {
      throw new SoloError('Error on cluster reset', e);
    }
    return true;
  }
}
