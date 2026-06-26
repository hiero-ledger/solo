// SPDX-License-Identifier: Apache-2.0

import {type AnyYargs, type ArgvStruct} from './aliases.js';

export interface CommandDefinition {
  command: string;
  desc: string;
  builder?: (yargs: AnyYargs) => any;
  handler?: (argv: ArgvStruct) => Promise<void>;
}
