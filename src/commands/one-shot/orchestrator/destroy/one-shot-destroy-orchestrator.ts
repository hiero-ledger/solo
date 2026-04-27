// SPDX-License-Identifier: Apache-2.0

import {type SoloListrTask} from '../../../../types/index.js';
import {type OneShotSingleDestroyContext} from '../../one-shot-single-destroy-context.js';
import {type Lock} from '../../../../core/lock/lock.js';
import {type CommandFlags} from '../../../../types/flag-types.js';
import {type ArgvStruct} from '../../../../types/aliases.js';

export interface OneShotDestroyOrchestrator {
  buildDestroyPipeline(
    argv: ArgvStruct,
    flagsList: CommandFlags,
    leaseReference: {value?: Lock},
  ): SoloListrTask<OneShotSingleDestroyContext>[];
}
