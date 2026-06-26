// SPDX-License-Identifier: Apache-2.0

import {type SoloListrTaskWrapper} from './index.js';

export type PromptFunction = (task: SoloListrTaskWrapper<any>, input: any, data?: any) => Promise<any>;

export type {CommandFlag} from './command-flag.js';
export type {Definition} from './definition.js';
export type {CommandFlags} from './command-flags.js';
