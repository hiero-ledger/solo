// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../errors/solo-errors.js';
import {type AnyYargs, type ArgvStruct} from '../../types/aliases.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {type CommandDefinition} from '../../types/index.js';
import {type CommandFlags} from '../../types/flag-types.js';
import {Flags as flags} from '../../commands/flags.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {InitCommand} from '../../commands/init/init.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {type TaskList} from '../task-list/task-list.js';
import {ListrContext, ListrRendererValue} from 'listr2';
import * as constants from '../constants.js';
import {SpinnerListrOptions} from '../spinner-listr-options.js';

export const ONE_SHOT_COMMAND: string = 'one-shot';
export const SINGLE_SUBCOMMAND: string = 'single';
export const SINGLE_DEPLOY: string = 'deploy';
export const SINGLE_DESTROY: string = 'destroy';

@injectable()
export class Subcommand {
  // TODO: Subcommand should have its own class file
  public constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly commandHandlerClass: any,
    public readonly commandHandler: (argv: ArgvStruct) => Promise<boolean>,
    public readonly flags: CommandFlags,
    public readonly dependencies: string[] = [],
    public readonly createCluster: boolean = false,
    @inject(InjectTokens.InitCommand) private readonly initCommand?: InitCommand,
    @inject(InjectTokens.TaskList)
    private readonly taskList?: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
  ) {
    this.initCommand = patchInject(initCommand, InjectTokens.InitCommand, this.constructor.name);
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
  }

  public async installDependencies(
    useSmallMemoryCluster: boolean = false,
    collapseTasks: boolean = false,
  ): Promise<void> {
    const tasks: any = this.taskList.newTaskList(
      [
        ...this.initCommand.installDependenciesTasks({
          deps: this.dependencies,
          createCluster: this.createCluster,
          useSmallMemoryCluster,
        }),
      ],
      collapseTasks ? SpinnerListrOptions.build(true) : constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      this.name,
    );
    if (this.taskList.parentTaskListMap.size === 0) {
      try {
        await tasks.run();
      } catch (error: Error | any) {
        throw new SoloErrors.system.dependencyInstallFailed('dependencies', error);
      }
    }
  }
}

// TODO: CommandGroup should have its own class file
export class CommandGroup {
  public readonly subcommands: Subcommand[] = [];

  public constructor(
    public readonly name: string,
    public readonly description: string,
  ) {}

  public addSubcommand(subcommand: Subcommand): CommandGroup {
    this.subcommands.push(subcommand);
    return this;
  }
}

// TODO: CommandBuilder should have its own class file
export class CommandBuilder {
  private readonly commandGroups: CommandGroup[] = [];

  public constructor(
    private readonly name: string,
    private readonly description: string,
    private readonly logger: SoloLogger,
  ) {}

  public addCommandGroup(commandGroup: CommandGroup): CommandBuilder {
    this.commandGroups.push(commandGroup);
    return this;
  }

  public build(): CommandDefinition {
    const commandGroups: CommandGroup[] = this.commandGroups;
    const logger: SoloLogger = this.logger;

    const commandName: string = this.name;
    const commandDescription: string = this.description;
    const demandCommand: string = `select a ${commandName} command`;

    return {
      command: commandName,
      desc: commandDescription,
      builder: (yargs: AnyYargs): AnyYargs => {
        for (const commandGroup of commandGroups) {
          yargs.command({
            command: commandGroup.name,
            desc: commandGroup.description,
            builder: (yargs: AnyYargs): AnyYargs => {
              for (const subcommand of commandGroup.subcommands) {
                const handlerDefinition: CommandDefinition = {
                  command: subcommand.name,
                  desc: subcommand.description,
                  handler: async (argv): Promise<void> => {
                    const commandPath: string = `${commandName} ${commandGroup.name} ${subcommand.name}`;

                    logger.info(`==== Running '${commandPath}' ===`);

                    const handlerCallback: (argv: ArgvStruct) => Promise<boolean> = subcommand.commandHandler.bind(
                      subcommand.commandHandlerClass,
                    );

                    const isOneShotSingleDeploy: boolean =
                      commandPath === `${ONE_SHOT_COMMAND} ${SINGLE_SUBCOMMAND} ${SINGLE_DEPLOY}`;
                    const isOneShotSingleDestroy: boolean =
                      commandPath === `${ONE_SHOT_COMMAND} ${SINGLE_SUBCOMMAND} ${SINGLE_DESTROY}`;
                    const useSmallMemoryCluster: boolean = isOneShotSingleDeploy;

                    // Collapse the dependency-install preamble (e.g. 'Check dependencies', 'Setup chart
                    // manager') to single spinner lines for one-shot single deploy (gated on parallel
                    // mode) and one-shot single destroy, matching their respective pipelines.
                    const collapseDependencyTasks: boolean =
                      (isOneShotSingleDeploy && argv[flags.parallelDeploy.name] !== false) || isOneShotSingleDestroy;

                    await subcommand.installDependencies(useSmallMemoryCluster, collapseDependencyTasks);
                    const response: boolean = await handlerCallback(argv);

                    logger.info(`==== Finished running '${commandPath}'====`);

                    if (!response) {
                      throw new SoloErrors.internal.commandReturnedFalse(commandName, commandPath);
                    }
                  },
                };

                if (subcommand.flags) {
                  handlerDefinition.builder = (y: AnyYargs): void => {
                    flags.setRequiredCommandFlags(y, ...subcommand.flags.required);
                    flags.setOptionalCommandFlags(y, ...subcommand.flags.optional);
                  };
                }

                yargs.command(handlerDefinition);
              }

              yargs.demandCommand(1, `Select a ${commandName} ${commandGroup.name} command`);
              return yargs;
            },
          });
        }

        yargs.demandCommand(1, demandCommand);

        return yargs;
      },
    };
  }
}
