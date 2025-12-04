// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../errors/solo-error.js';
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

  public async installDependencies(): Promise<void> {
    const tasks = this.taskList.newTaskList(
      [
        ...this.initCommand.installDependenciesTasks({
          deps: this.dependencies,
          createCluster: this.createCluster,
        }),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      this.name,
    );
    if (this.taskList.parentTaskListMap.size === 0) {
      try {
        await tasks.run();
      } catch (error: Error | any) {
        throw new SoloError(`Could not install dependencies: ${error.message}`, error);
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
              yargs.help(); // Enable help for command group level
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

                    await subcommand.installDependencies();
                    const response: boolean = await handlerCallback(argv);

                    logger.info(`==== Finished running '${commandPath}'====`);

                    if (!response) {
                      throw new SoloError(`Error running ${commandPath}, expected return value to be true`);
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
              return yargs.help();
            },
          });
        }

        yargs.demandCommand(1, demandCommand);

        return yargs.help();
      },
    };
  }
}
