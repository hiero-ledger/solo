// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags, Flags as flags} from './flags.js';
import {type AnyListrContext, type AnyYargs, type ArgvStruct} from '../types/aliases.js';
import {type CommandDefinition} from '../types/index.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../core/command-path-builders/command-builder.js';
import {injectable} from 'tsyringe-neo';
import {main} from '../index.js';
import {v4 as uuid4} from 'uuid';
import {NamespaceName} from '../types/namespace/namespace-name.js';

interface QuickStartDeployConfigClass {
  clusterRef: string;
  context: string;
  deployment: string;
  namespace: NamespaceName;
  numberOfConsensusNodes: number;
}

interface QuickStartDeployContext {
  config: QuickStartDeployConfigClass;
}

interface QuickStartDestroyConfigClass {
  dummyVariable?: string; // Placeholder for actual configuration properties
}

interface QuickStartDestroyContext {
  config: QuickStartDestroyConfigClass;
}

@injectable()
export class QuickStartCommand extends BaseCommand {
  public static readonly COMMAND_NAME: string = 'quick-start';

  private static readonly SINGLE_ADD_CONFIGS_NAME: string = 'singleAddConfigs';

  private static readonly SINGLE_DESTROY_CONFIGS_NAME: string = 'singleDestroyConfigs';

  private static readonly SINGLE_ADD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      // flags.apiPermissionProperties,
      // flags.applicationEnv,
      // flags.applicationProperties,
      // flags.cacheDir,
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

  private newArgv(): string[] {
    return ['${PATH}/node', '${SOLO_ROOT}/solo.ts'];
  }

  private optionFromFlag(flag: CommandFlag): string {
    return `--${flag.name}`;
  }

  private argvPushGlobalFlags(argv: string[]): string[] {
    argv.push(this.optionFromFlag(Flags.devMode), this.optionFromFlag(Flags.quiet));
    return argv;
  }

  private async prepareValuesArgForQuickStart(config: QuickStartDeployConfigClass): Promise<string> {
    return '';
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const tasks: Listr<QuickStartDeployContext> = new Listr<QuickStartDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            this.configManager.update(argv);

            flags.disablePrompts(QuickStartCommand.SINGLE_ADD_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...QuickStartCommand.SINGLE_ADD_FLAGS_LIST.required,
              ...QuickStartCommand.SINGLE_ADD_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              QuickStartCommand.SINGLE_ADD_CONFIGS_NAME,
              allFlags,
            ) as QuickStartDeployConfigClass;

            context_.config.clusterRef = context_.config.clusterRef || `solo-${uuid4()}`; // TODO come up with better solution to avoid conflicts
            context_.config.context = context_.config.context || this.k8Factory.default().contexts().readCurrent();
            context_.config.deployment = context_.config.deployment || `solo-deployment-${uuid4()}`; // TODO come up with better solution to avoid conflicts
            context_.config.namespace = context_.config.namespace || NamespaceName.of(`solo-${uuid4()}`); // TODO come up with better solution to avoid conflicts
            context_.config.numberOfConsensusNodes = context_.config.numberOfConsensusNodes || 1;
            return null;
          },
        },
        {
          title: 'solo init',
          task: async (): Promise<void> => {
            const argv: string[] = this.newArgv();
            argv.push('init');
            this.argvPushGlobalFlags(argv);
            await main(argv);
          },
        },
        {
          title: 'solo cluster-ref connect',
          task: async (context_): Promise<void> => {
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
            await main(argv);
          },
        },
        {
          title: 'solo deployment create',
          task: async (context_): Promise<void> => {
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
            await main(argv);
          },
        },
        {
          title: 'solo deployment add-cluster',
          task: async (context_): Promise<void> => {
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
            await main(argv);
          },
        }, // ClusterReferenceTest.setup(options);
        // NodeTest.keys(options);
        // NetworkTest.deploy(options);
        // NodeTest.setup(options);
        // NodeTest.start(options);
        // MirrorNodeTest.deploy(options);
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
    const tasks: Listr<QuickStartDestroyContext> = new Listr<QuickStartDestroyContext>([
      {
        title: 'Initialize',
        task: async (context_, task): Promise<Listr<AnyListrContext>> => {
          this.configManager.update(argv);

          flags.disablePrompts(QuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.optional);

          const allFlags: CommandFlag[] = [
            ...QuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.required,
            ...QuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.optional,
          ];

          await this.configManager.executePrompt(task, allFlags);

          context_.config = this.configManager.getConfig(
            QuickStartCommand.SINGLE_DESTROY_CONFIGS_NAME,
            allFlags,
          ) as QuickStartDestroyConfigClass;

          return null;
        },
      },
    ]);

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error destroying Solo in quick-start mode: ${error.message}`, error);
    }

    return true;
  }

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(QuickStartCommand.COMMAND_NAME, 'Manage quick start for solo network', this.logger)
      .addCommandGroup(
        new CommandGroup('single', 'A single consensus node quick start configuration')
          .addSubcommand(
            new Subcommand(
              'deploy',
              'Deploys all required components for the selected quick start configuration',
              this,
              this.deploy,
              (y: AnyYargs): void => {
                flags.setRequiredCommandFlags(y, ...QuickStartCommand.SINGLE_ADD_FLAGS_LIST.required);
                flags.setOptionalCommandFlags(y, ...QuickStartCommand.SINGLE_ADD_FLAGS_LIST.optional);
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
                flags.setRequiredCommandFlags(y, ...QuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.required);
                flags.setOptionalCommandFlags(y, ...QuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.optional);
              },
            ),
          ),
      )
      .build();
  }

  public async close(): Promise<void> {} // no-op
}
