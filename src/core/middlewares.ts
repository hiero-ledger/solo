// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../commands/flags.js';
import chalk from 'chalk';

import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type ConfigManager} from './config-manager.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type AnyObject, ArgvStruct} from '../types/aliases.js';
import {type ClusterReferenceName} from './../types/index.js';
import {SilentBreak} from './errors/silent-break.js';
import {type HelpRenderer} from './help-renderer.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';
import {LocalConfigRuntimeState} from '../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {K8} from '../integration/kube/k8.js';
import {type TaskList} from './task-list/task-list.js';
import {ListrContext, ListrRendererValue} from 'listr2';

@injectable()
export class Middlewares {
  public constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.HelpRenderer) private readonly helpRenderer: HelpRenderer,
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
  ) {
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.helpRenderer = patchInject(helpRenderer, InjectTokens.HelpRenderer, this.constructor.name);
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
  }

  public printCustomHelp(rootCmd: any): (argv: any) => void {
    /**
     * @param argv - listr Argv
     */
    return (argv: any): void => {
      if (!argv['help']) {
        return;
      }

      rootCmd.showHelp((output: string): void => {
        this.helpRenderer.render(rootCmd, output);
      });
      throw new SilentBreak('printed help, exiting');
    };
  }

  public setLoggerDevFlag(): (argv: ArgvStruct) => AnyObject {
    const logger: SoloLogger = this.logger;

    /**
     * @param argv - listr Argv
     */
    return (argv: any): AnyObject => {
      if (argv.dev) {
        logger.debug('Setting logger dev flag');
        logger.setDevMode(argv.dev);
      }

      return argv;
    };
  }

  /**
   * Processes the Argv and display the command header
   *
   * @returns callback function to be executed from listr
   */
  protected processArgumentsAndDisplayHeader(): (argv: ArgvStruct, yargs: any) => AnyObject {
    const k8Factory: K8Factory = this.k8Factory;
    const configManager: ConfigManager = this.configManager;
    const logger: SoloLogger = this.logger;

    /**
     * @param argv - listr Argv
     * @param yargs - listr Yargs
     */
    return (argv: any, yargs: any): AnyObject => {
      logger.debug('Processing arguments and displaying header');

      // set cluster and namespace in the global configManager from kubernetes context
      // so that we don't need to prompt the user
      const k8: K8 = k8Factory.default();
      const contextNamespace: NamespaceName = k8.contexts().readCurrentNamespace();
      const currentClusterName: string = k8.clusters().readCurrent();
      const contextName: string = k8.contexts().readCurrent();

      // reset config on `solo init` command
      if (argv._[0] === 'init') {
        configManager.reset();
      }

      const clusterName: string = configManager.getFlag<ClusterReferenceName>(flags.clusterRef) || currentClusterName;

      // Set namespace if not provided
      if (contextNamespace?.name) {
        configManager.setFlag(flags.namespace, contextNamespace);
      }

      // apply precedence for flags
      argv = configManager.applyPrecedence(argv, yargs.parsed.aliases);

      // update config manager
      configManager.update(argv);

      // Build data to be displayed
      const currentCommand: string = argv._.join(' ');
      const commandArguments: string = flags.stringifyArgv(argv);
      const commandData: string = (currentCommand + ' ' + commandArguments).trim();

      if (this.taskList.parentTaskListMap.size === 0) {
        // Display command header
        logger.showUser(
          chalk.cyan('\n******************************* Solo *********************************************'),
        );
        logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(configManager.getVersion()));
        logger.showUser(chalk.cyan('Kubernetes Context\t:'), chalk.yellow(contextName));
        logger.showUser(chalk.cyan('Kubernetes Cluster\t:'), chalk.yellow(clusterName));
        logger.showUser(chalk.cyan('Current Command\t\t:'), chalk.yellow(commandData));
        if (configManager.getFlag<NamespaceName>(flags.namespace)?.name) {
          logger.showUser(chalk.cyan('Kubernetes Namespace\t:'), chalk.yellow(configManager.getFlag(flags.namespace)));
        }
        logger.showUser(
          chalk.cyan('**********************************************************************************'),
        );
      }

      return argv;
    };
  }
}
