// SPDX-License-Identifier: Apache-2.0

import {Listr, ListrRendererValue} from 'listr2';
import {SoloError} from '../../core/errors/solo-error.js';
import * as constants from '../../core/constants.js';
import {BaseCommand} from '../base.js';
import {Flags, Flags as flags} from '../flags.js';
import {type AnyListrContext, type AnyYargs, type ArgvStruct} from '../../types/aliases.js';
import {type CommandDefinition, SoloListrTaskWrapper} from '../../types/index.js';
import {type CommandFlag, type CommandFlags} from '../../types/flag-types.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {injectable} from 'tsyringe-neo';
import {v4 as uuid4} from 'uuid';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {StringEx} from '../../business/utils/string-ex.js';
import {ArgumentProcessor} from '../../argument-processor.js';
import {QuickStartCommand} from './quick-start.js';
import {QuickStartSingleDeployConfigClass} from './quick-start-single-deploy-config-class.js';
import {QuickStartSingleDeployContext} from './quick-start-single-deploy-context.js';
import {QuickStartSingleDestroyConfigClass} from './quick-start-single-destroy-config-class.js';
import {QuickStartSingleDestroyContext} from './quick-start-single-destroy-context.js';
import {ClusterCommandHandlers} from '../cluster/handlers.js';
import {DeploymentCommand} from '../deployment.js';

@injectable()
export class DefaultQuickStartCommand extends BaseCommand implements QuickStartCommand {
  public static readonly COMMAND_NAME: string = 'quick-start';

  private static readonly SINGLE_ADD_CONFIGS_NAME: string = 'singleAddConfigs';

  private static readonly SINGLE_DESTROY_CONFIGS_NAME: string = 'singleDestroyConfigs';

  private static readonly SINGLE_ADD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      // flags.apiPermissionProperties,
      // flags.applicationEnv,
      // flags.applicationProperties,
      flags.cacheDir,
      flags.clusterRef,
      flags.clusterSetupNamespace,
      flags.context,
      flags.deployment,
      flags.devMode,
      // flags.log4j2Xml,
      flags.namespace,
      // flags.networkDeploymentValuesFile,
      flags.numberOfConsensusNodes,
      // flags.persistentVolumeClaims,
      // flags.pinger,
      flags.quiet,
      // flags.releaseTag,
      // flags.soloChartVersion,
      // TODO: flags.mirrorNodeValuesFile,
      // TODO: flags.explorerValuesFile,
      // TODO: flags.relayValuesFile,
    ],
  };

  private static readonly SINGLE_DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [],
  };

  // Although empty, tsyringe requires the constructor to be present
  public constructor() {
    super();
  }

  private newArgv(): string[] {
    return ['${PATH}/node', '${SOLO_ROOT}/solo.ts'];
  }

  private optionFromFlag(flag: CommandFlag): string {
    return `--${flag.name}`;
  }

  private argvPushGlobalFlags(argv: string[], cacheDirectory: string = StringEx.EMPTY): string[] {
    argv.push(this.optionFromFlag(Flags.devMode), this.optionFromFlag(Flags.quiet));
    if (cacheDirectory) {
      argv.push(this.optionFromFlag(Flags.cacheDir), cacheDirectory);
    }
    return argv;
  }

  private async prepareValuesArgForQuickStart(config: QuickStartSingleDeployConfigClass): Promise<string> {
    return '';
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const tasks: Listr<QuickStartSingleDeployContext, ListrRendererValue, ListrRendererValue> =
      this.taskList.newQuickStartSingleDeployTaskList(
        [
          // TODO fix the sysout problem that causes this output only, but then dumps the rest of the output on exit, but it shows multiple lines for all of the row updates
          {
            title: 'Initialize',
            task: async (
              context_: QuickStartSingleDeployContext,
              task: SoloListrTaskWrapper<QuickStartSingleDeployContext>,
            ): Promise<Listr<AnyListrContext>> => {
              this.configManager.update(argv);

              flags.disablePrompts(DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST.optional);

              const allFlags: CommandFlag[] = [
                ...DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST.required,
                ...DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST.optional,
              ];

              await this.configManager.executePrompt(task, allFlags);

              context_.config = this.configManager.getConfig(
                DefaultQuickStartCommand.SINGLE_ADD_CONFIGS_NAME,
                allFlags,
              ) as QuickStartSingleDeployConfigClass;

              const uniquePostfix: string = uuid4().slice(-8);

              context_.config.clusterRef = context_.config.clusterRef || `solo-${uniquePostfix}`; // TODO come up with better solution to avoid conflicts
              context_.config.context = context_.config.context || this.k8Factory.default().contexts().readCurrent();
              context_.config.deployment = context_.config.deployment || `solo-deployment-${uniquePostfix}`; // TODO come up with better solution to avoid conflicts
              context_.config.namespace = context_.config.namespace || NamespaceName.of(`solo-${uniquePostfix}`); // TODO come up with better solution to avoid conflicts
              context_.config.numberOfConsensusNodes = context_.config.numberOfConsensusNodes || 1;
              return null;
            },
          },
          {
            title: 'solo init',
            task: async (context_: QuickStartSingleDeployContext, task): Promise<void> => {
              this.taskList.initTaskListParent = task;
              const argv: string[] = this.newArgv();
              argv.push('init');
              this.argvPushGlobalFlags(argv, context_.config.cacheDir);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo cluster-ref connect',
            task: async (context_: QuickStartSingleDeployContext, task): Promise<void> => {
              this.taskList.parentTaskListMap.set(ClusterCommandHandlers.CONNECT_COMMAND, task);
              const argv: string[] = this.newArgv();
              argv.push(
                'cluster-ref',
                'connect',
                this.optionFromFlag(Flags.clusterRef),
                context_.config.clusterRef,
                this.optionFromFlag(Flags.context),
                context_.config.context,
              );
              this.argvPushGlobalFlags(argv);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo deployment create',
            task: async (context_: QuickStartSingleDeployContext, task): Promise<void> => {
              this.taskList.parentTaskListMap.set(DeploymentCommand.CREATE_COMMAND, task);
              const argv: string[] = this.newArgv();
              argv.push(
                'deployment',
                'create',
                this.optionFromFlag(Flags.deployment),
                context_.config.deployment,
                this.optionFromFlag(Flags.namespace),
                context_.config.namespace.name,
              );
              this.argvPushGlobalFlags(argv);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo deployment add-cluster',
            task: async (context_: QuickStartSingleDeployContext, task): Promise<void> => {
              this.taskList.parentTaskListMap.set(DeploymentCommand.ADD_COMMAND, task);
              const argv: string[] = this.newArgv();
              argv.push(
                'deployment',
                'add-cluster',
                this.optionFromFlag(Flags.deployment),
                context_.config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                context_.config.clusterRef,
                this.optionFromFlag(Flags.numberOfConsensusNodes),
                context_.config.numberOfConsensusNodes.toString(),
              );
              this.argvPushGlobalFlags(argv);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo cluster-ref setup',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              const argv: string[] = this.newArgv();
              argv.push('cluster-ref', 'setup', this.optionFromFlag(Flags.clusterRef), context_.config.clusterRef);
              this.argvPushGlobalFlags(argv);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo node keys',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              const argv: string[] = this.newArgv();
              argv.push(
                'node',
                'keys',
                this.optionFromFlag(Flags.deployment),
                context_.config.deployment,
                this.optionFromFlag(Flags.generateGossipKeys),
                'true',
                this.optionFromFlag(Flags.generateTlsKeys),
              );
              this.argvPushGlobalFlags(argv, context_.config.cacheDir);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo network deploy',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              const argv: string[] = this.newArgv();
              argv.push('network', 'deploy', this.optionFromFlag(Flags.deployment), context_.config.deployment);
              this.argvPushGlobalFlags(argv, context_.config.cacheDir);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo node setup',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              const argv: string[] = this.newArgv();
              argv.push('node', 'setup', this.optionFromFlag(Flags.deployment), context_.config.deployment);
              this.argvPushGlobalFlags(argv, context_.config.cacheDir);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo node start',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              const argv: string[] = this.newArgv();
              argv.push('node', 'start', this.optionFromFlag(Flags.deployment), context_.config.deployment);
              this.argvPushGlobalFlags(argv);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo mirror-node deploy',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              const argv: string[] = this.newArgv();
              argv.push(
                'mirror-node',
                'deploy',
                this.optionFromFlag(Flags.deployment),
                context_.config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                context_.config.clusterRef,
                this.optionFromFlag(Flags.pinger),
              );
              this.argvPushGlobalFlags(argv, context_.config.cacheDir);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo explorer deploy',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              const argv: string[] = this.newArgv();
              argv.push(
                'explorer',
                'deploy',
                this.optionFromFlag(Flags.deployment),
                context_.config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                context_.config.clusterRef,
              );
              this.argvPushGlobalFlags(argv, context_.config.cacheDir);
              await ArgumentProcessor.process(argv);
            },
          },
          {
            title: 'solo relay deploy',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              const argv: string[] = this.newArgv();
              argv.push(
                'relay',
                'deploy',
                this.optionFromFlag(Flags.deployment),
                context_.config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                context_.config.clusterRef,
                this.optionFromFlag(Flags.nodeAliasesUnparsed),
                'node1',
              );
              this.argvPushGlobalFlags(argv);
              await ArgumentProcessor.process(argv);
            },
          },
          // TODO expose port forward endpoints and dump the URLs to the user output
          // TODO update documentation
          // TODO make sure CLI Help script is working
          // TODO manually test from the command line
        ],
        {
          concurrent: false,
          rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        },
      );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error deploying Solo in quick-start mode: ${error.message}`, error);
    }

    return true;
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    const tasks: Listr<QuickStartSingleDestroyContext> = new Listr<QuickStartSingleDestroyContext>([
      {
        title: 'Initialize',
        task: async (context_, task): Promise<Listr<AnyListrContext>> => {
          this.configManager.update(argv);

          flags.disablePrompts(DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.optional);

          const allFlags: CommandFlag[] = [
            ...DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.required,
            ...DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.optional,
          ];

          await this.configManager.executePrompt(task, allFlags);

          context_.config = this.configManager.getConfig(
            DefaultQuickStartCommand.SINGLE_DESTROY_CONFIGS_NAME,
            allFlags,
          ) as QuickStartSingleDestroyConfigClass;

          return null;
        },
      },
      // TODO implement destroy tasks
    ]);

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error destroying Solo in quick-start mode: ${error.message}`, error);
    }

    return true;
  }

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(DefaultQuickStartCommand.COMMAND_NAME, 'Manage quick start for solo network', this.logger)
      .addCommandGroup(
        new CommandGroup('single', 'A single consensus node quick start configuration')
          .addSubcommand(
            new Subcommand(
              'deploy',
              'Deploys all required components for the selected quick start configuration',
              this,
              this.deploy,
              (y: AnyYargs): void => {
                flags.setRequiredCommandFlags(y, ...DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST.required);
                flags.setOptionalCommandFlags(y, ...DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST.optional);
              },
            ),
          )
          .addSubcommand(
            new Subcommand(
              'destroy',
              'Removes the deployed resources for the selected quick start configuration',
              this,
              this.destroy,
              (y: AnyYargs): void => {
                flags.setRequiredCommandFlags(y, ...DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.required);
                flags.setOptionalCommandFlags(y, ...DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.optional);
              },
            ),
          ),
      )
      .build();
  }

  public async close(): Promise<void> {} // no-op
}
