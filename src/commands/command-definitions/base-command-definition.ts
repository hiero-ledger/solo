// SPDX-License-Identifier: Apache-2.0

import {type CommandDefinition} from '../../types/index.js';

export abstract class BaseCommandDefinition {
  public static readonly COMMAND_NAME: string;
  protected static readonly DESCRIPTION: string;

  public abstract getCommandDefinition(): CommandDefinition;
}
