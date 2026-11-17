// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {UpdateCommand} from '../update.js';
import {Flags as flags} from '../flags.js';
import {type CommandDefinition} from '../../types/index.js';
import {type AnyYargs, type ArgvStruct} from '../../types/aliases.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

@injectable()
export class UpdateCommandDefinition extends BaseCommandDefinition {
  public static override readonly COMMAND_NAME: string = 'update';
  protected static override readonly DESCRIPTION: string =
    'Update the Solo standalone binary to the latest release, or to the release given by --target-version.';

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.UpdateCommand) private readonly updateCommand?: UpdateCommand,
  ) {
    super();
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.updateCommand = patchInject(updateCommand, InjectTokens.UpdateCommand, this.constructor.name);
  }

  public getCommandDefinition(): CommandDefinition {
    return {
      command: UpdateCommandDefinition.COMMAND_NAME,
      desc: UpdateCommandDefinition.DESCRIPTION,
      builder: (yargs: AnyYargs): void => {
        flags.setOptionalCommandFlags(yargs, UpdateCommand.FLAGS_LIST.optional, UpdateCommandDefinition.COMMAND_NAME);
      },
      handler: async (argv: ArgvStruct): Promise<void> => {
        this.logger.info(`==== Running '${UpdateCommandDefinition.COMMAND_NAME}' ===`);
        await this.updateCommand.update(argv);
      },
    };
  }
}
