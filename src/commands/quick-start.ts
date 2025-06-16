// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type AnyYargs, type ArgvStruct} from '../types/aliases.js';
import {type CommandDefinition} from '../types/index.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../core/command-path-builders/command-builder.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type ComponentFactoryApi} from '../core/config/remote/api/component-factory-api.js';

interface QuickStartDeployConfigClass {}

interface QuickStartDeployContext {
  config: QuickStartDeployConfigClass;
}

interface QuickStartDestroyConfigClass {}

interface QuickStartDestroyContext {
  config: QuickStartDestroyConfigClass;
}

@injectable()
export class QuickStartCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.ComponentFactory) private readonly componentFactory: ComponentFactoryApi) {
    super();
  }

  public static readonly COMMAND_NAME: string = 'quick-start';

  private static readonly ADD_CONFIGS_NAME: string = 'addConfigs';

  private static readonly DESTROY_CONFIGS_NAME: string = 'destroyConfigs';

  private static readonly ADD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [],
  };

  private static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [],
  };

  private async prepareValuesArgForQuickStart(config: QuickStartDeployConfigClass): Promise<string> {
    const valuesArgument: string = '';

    return valuesArgument;
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const tasks: Listr<QuickStartDeployContext> = new Listr<QuickStartDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            this.configManager.update(argv);

            flags.disablePrompts(QuickStartCommand.ADD_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...QuickStartCommand.ADD_FLAGS_LIST.required,
              ...QuickStartCommand.ADD_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              QuickStartCommand.ADD_CONFIGS_NAME,
              allFlags,
            ) as QuickStartDeployConfigClass;
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

          flags.disablePrompts(QuickStartCommand.DESTROY_FLAGS_LIST.optional);

          const allFlags: CommandFlag[] = [
            ...QuickStartCommand.DESTROY_FLAGS_LIST.required,
            ...QuickStartCommand.DESTROY_FLAGS_LIST.optional,
          ];

          await this.configManager.executePrompt(task, allFlags);

          context_.config = this.configManager.getConfig(
            QuickStartCommand.DESTROY_CONFIGS_NAME,
            allFlags,
          ) as QuickStartDestroyConfigClass;

          return null;
        },
      },
    ]);

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error destroying block node: ${error.message}`, error);
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
                flags.setRequiredCommandFlags(y, ...QuickStartCommand.ADD_FLAGS_LIST.required);
                flags.setOptionalCommandFlags(y, ...QuickStartCommand.ADD_FLAGS_LIST.optional);
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
                flags.setRequiredCommandFlags(y, ...QuickStartCommand.DESTROY_FLAGS_LIST.required);
                flags.setOptionalCommandFlags(y, ...QuickStartCommand.DESTROY_FLAGS_LIST.optional);
              },
            ),
          ),
      )
      .build();
  }

  public async close(): Promise<void> {} // no-op
}
