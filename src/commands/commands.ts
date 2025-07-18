// SPDX-License-Identifier: Apache-2.0

import {type InitCommand} from './init/init.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type CommandDefinition} from '../types/index.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';

/**
 * Return a list of Yargs command builder to be exposed through CLI
 * @returns an array of Yargs command builder
 */
@injectable()
export class Commands {
  public constructor(@inject(InjectTokens.InitCommand) public readonly initCommand?: InitCommand) {
    this.initCommand = patchInject(initCommand, InjectTokens.InitCommand, this.constructor.name);
  }

  public getCommandDefinitions(): CommandDefinition[] {
    return [this.initCommand.getCommandDefinition()];
  }
}
