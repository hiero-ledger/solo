// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../commands/flags.js';
import chalk from 'chalk';

import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type ConfigManager} from './config-manager.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type AnyObject, ArgvStruct} from '../types/aliases.js';
import {type ClusterReferenceName} from './../types/index.js';
import {SoloError} from './errors/solo-error.js';
import {SilentBreak} from './errors/silent-break.js';
import {type HelpRenderer} from './help-renderer.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';
import {LocalConfigRuntimeState} from '../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';

@injectable()
export class Middlewares {
  constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.HelpRenderer) private readonly helpRenderer: HelpRenderer,
  ) {
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.helpRenderer = patchInject(helpRenderer, InjectTokens.HelpRenderer, this.constructor.name);
  }

  public printCustomHelp(rootCmd: any) {
    const logger = this.logger;

    /**
     * @param argv - listr Argv
     */
    return (argv: any): void => {
      if (!argv['help']) {
        return;
      }

      rootCmd.showHelp((output: string) => {
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
  public processArgumentsAndDisplayHeader() {
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
      const k8 = k8Factory.default();
      const contextNamespace: NamespaceName = k8.contexts().readCurrentNamespace();
      const currentClusterName: string = k8.clusters().readCurrent();
      const contextName: string = k8.contexts().readCurrent();

      // reset config on `solo init` command
      if (argv._[0] === 'init') {
        configManager.reset();
      }

      const clusterName = configManager.getFlag<ClusterReferenceName>(flags.clusterRef) || currentClusterName;

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
    const remoteConfig = this.remoteConfig;
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
        (command === 'cluster-ref' && subCommand === 'connect') ||
        (command === 'cluster-ref' && subCommand === 'disconnect') ||
        (command === 'cluster-ref' && subCommand === 'info') ||
        (command === 'cluster-ref' && subCommand === 'list') ||
        (command === 'cluster-ref' && subCommand === 'setup') ||
        (command === 'deployment' && subCommand === 'add-cluster') ||
        (command === 'deployment' && subCommand === 'create') ||
        (command === 'deployment' && subCommand === 'list');

      // Load but don't validate if command is 'node keys'
      const validateRemoteConfig = !(command === 'node' && subCommand === 'keys');

      // Skip validation for consensus nodes if the command is 'network deploy'
      const skipConsensusNodeValidation = command === 'network' && subCommand === 'deploy';

      if (!skip) {
        await remoteConfig.loadAndValidate(argv, validateRemoteConfig, skipConsensusNodeValidation);
      }

      return argv;
    };
  }

  /**
   * Handles loading local config
   *
   * @returns callback function to be executed from listr
   */
  public loadLocalConfig() {
    return async (argv: any): Promise<AnyObject> => {
      const command: string = argv._[0];
      const runMiddleware: boolean = command !== 'init';

      if (runMiddleware) {
        this.logger.debug('Loading local config');
        await this.localConfig.load();
      }
      return argv;
    };
  }

  /**
   * Checks if the Solo instance has been initialized
   *
   * @returns callback function to be executed from listr
   */
  public checkIfInitialized() {
    const logger = this.logger;

    /**
     * @param argv - listr Argv
     */
    return async (argv: any): Promise<AnyObject> => {
      logger.debug('Checking if local config exists');

      const command = argv._[0];
      const allowMissingLocalConfig = command === 'init';

      if (!allowMissingLocalConfig && !this.localConfig.configFileExists()) {
        throw new SoloError('Please run `solo init` to create required files');
      }

      return argv;
    };
  }
}
