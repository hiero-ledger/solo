// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as constants from '../../core/constants.js';
import {CacheCommand} from '../cache.js';

@injectable()
export class CacheCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.CacheCommand) public readonly cacheCommand?: CacheCommand,
  ) {
    super();
    this.cacheCommand = patchInject(cacheCommand, InjectTokens.CacheCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'cache';
  protected static override readonly DESCRIPTION: string = 'Manage solo cached items.';

  public static readonly IMAGE_SUBCOMMAND_NAME: string = 'image';

  public static readonly IMAGE_PULL: string = 'pull';
  public static readonly IMAGE_LOAD: string = 'load';
  public static readonly IMAGE_LIST: string = 'list';
  public static readonly IMAGE_CLEAR: string = 'clear';
  public static readonly IMAGE_STATUS: string = 'status';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(CacheCommandDefinition.COMMAND_NAME, CacheCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME, 'Manage image archives used by solo.')
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_PULL,
              'pull and caches docker images used by solo, prerequisite for `solo cache image load`.',
              this.cacheCommand,
              this.cacheCommand.pull,
              CacheCommand.PULL_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES, constants.CRANE],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_LOAD,
              'loads the images archive into a cluster. Pulling the images with `solo cache images pull` is a prerequisite.',
              this.cacheCommand,
              this.cacheCommand.load,
              CacheCommand.LOAD_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES, constants.CRANE],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_LIST,
              'lists all cached image archives.',
              this.cacheCommand,
              this.cacheCommand.list,
              CacheCommand.LIST_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_CLEAR,
              'clears the image archives.',
              this.cacheCommand,
              this.cacheCommand.clear,
              CacheCommand.CLEAR_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          )
          .addSubcommand(
            new Subcommand(
              CacheCommandDefinition.IMAGE_STATUS,
              'lists all images, displays data about them and displays all missing images.',
              this.cacheCommand,
              this.cacheCommand.status,
              CacheCommand.STATUS_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          ),
      )
      .build();
  }
}
