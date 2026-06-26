// SPDX-License-Identifier: Apache-2.0

import {type Definition} from './definition.js';
import {type PromptFunction} from './flag-types.js';

export interface CommandFlag {
  constName: string;
  name: string;
  definition: Definition;
  prompt: PromptFunction;
  validate?: (input: any) => boolean;
}
