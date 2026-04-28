// SPDX-License-Identifier: Apache-2.0

import {type OneShotSingleDestroyContext} from '../../one-shot-single-destroy-context.js';
import {type Lock} from '../../../../core/lock/lock.js';
import {type CommandFlags} from '../../../../types/flag-types.js';
import {type ArgvStruct} from '../../../../types/aliases.js';
import {type Pipeline} from '../pipeline.js';

export interface OneShotDestroyOrchestrator {
  buildDestroyPipeline(
    argv: ArgvStruct,
    flagsList: CommandFlags,
    leaseReference: {value?: Lock},
  ): Pipeline<OneShotSingleDestroyContext>;
}
