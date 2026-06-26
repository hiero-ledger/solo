// SPDX-License-Identifier: Apache-2.0

import {type CommandFlag} from './command-flag.js';

export interface CommandFlags {
  required: CommandFlag[];
  optional: CommandFlag[];
}
