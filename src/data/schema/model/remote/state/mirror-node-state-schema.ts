// SPDX-License-Identifier: Apache-2.0

import {Exclude} from 'class-transformer';
import {BaseStateSchema} from './base-state-schema.js';

@Exclude()
export class MirrorNodeStateSchema extends BaseStateSchema {}
