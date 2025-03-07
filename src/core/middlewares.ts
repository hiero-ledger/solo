/**
 * SPDX-License-Identifier: Apache-2.0
 */

import {Flags as flags} from '../commands/flags.js';
import chalk from 'chalk';

import {type NamespaceName} from './kube/resources/namespace/namespace_name.js';
import {type Opts} from '../commands/base.js';
import {type ConfigManager} from './config_manager.js';
import {type K8Factory} from './kube/k8_factory.js';
import {type SoloLogger} from './logging.js';
import {type AnyObject} from '../types/aliases.js';
import {type RemoteConfigManager} from './config/remote/remote_config_manager.js';
import {type ClusterRef} from './config/remote/types.js';

export class Middlewares {
  private readonly remoteConfigManager: RemoteConfigManager;
  private readonly configManager: ConfigManager;
  private readonly k8Factory: K8Factory;
  private readonly logger: SoloLogger;

  constructor(opts: Opts) {
    this.configManager = opts.configManager;
    this.remoteConfigManager = opts.remoteConfigManager;
    this.k8Factory = opts.k8Factory;
    this.logger = opts.logger;
  }

  public setLoggerDevFlag() {
    const logger = this.logger;

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
  public processArgumentsAndDisplayHeader() {
    const k8Factory = this.k8Factory;
    const configManager = this.configManager;
    const logger = this.logger;

    /**
     * @param argv - listr Argv
     * @param yargs - listr Yargs
     */
    return (argv: any, yargs: any): AnyObject => {
      logger.debug('Processing arguments and displaying header');

      // set cluster and namespace in the global configManager from kubernetes context
      // so that we don't need to prompt the user
      const k8 = k8Factory.default();
      const contextNamespace: NamespaceName = k8.contexts().readCurrentNamespace();
      const currentClusterName: string = k8.clusters().readCurrent();
      const contextName: string = k8.contexts().readCurrent();

      // reset config on `solo init` command
      if (argv._[0] === 'init') {
        configManager.reset();
      }

      const clusterName = configManager.getFlag<ClusterRef>(flags.clusterRef) || currentClusterName;

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
      logger.showUser(chalk.cyan('**********************************************************************************'));

      return argv;
    };
  }

  /**
   * Handles loading remote config if the command access the cluster
   *
   * @returns callback function to be executed from listr
   */
  public loadRemoteConfig() {
    const remoteConfigManager = this.remoteConfigManager;
    const logger = this.logger;

    /**
     * @param argv - listr Argv
     */
    return async (argv: any): Promise<AnyObject> => {
      logger.debug('Loading remote config');

      const command = argv._[0];
      const subCommand = argv._[1];
      const skip =
        command === 'init' ||
        (command === 'node' && subCommand === 'keys') ||
        (command === 'cluster' && subCommand === 'connect') ||
        (command === 'cluster' && subCommand === 'disconnect') ||
        (command === 'cluster' && subCommand === 'info') ||
        (command === 'cluster' && subCommand === 'list') ||
        (command === 'cluster' && subCommand === 'setup') ||
        (command === 'deployment' && subCommand === 'create') ||
        (command === 'deployment' && subCommand === 'list');

      if (command === 'node' && subCommand === 'keys') {
        await remoteConfigManager.loadAndValidate(argv, false);
      }

      if (!skip) {
        await remoteConfigManager.loadAndValidate(argv);
      }

      return argv;
    };
  }
}