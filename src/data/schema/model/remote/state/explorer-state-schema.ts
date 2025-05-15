// SPDX-License-Identifier: Apache-2.0

import {Exclude} from 'class-transformer';
import {BaseState} from './base-state.js';

@Exclude()
export class ExplorerStateSchema extends BaseState {}