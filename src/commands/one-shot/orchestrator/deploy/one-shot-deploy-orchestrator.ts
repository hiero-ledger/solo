// SPDX-License-Identifier: Apache-2.0

import {type OneShotSingleDeployConfigClass} from '../../one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../../one-shot-single-deploy-context.js';
import {type Lock} from '../../../../core/lock/lock.js';
import {type CommandFlags} from '../../../../types/flag-types.js';
import {type ArgvStruct} from '../../../../types/aliases.js';
import {type Pipeline} from '../pipeline.js';

export interface OneShotDeployOrchestrator {
  buildDeployPipeline(
    argv: ArgvStruct,
    flagsList: CommandFlags,
    leaseReference: {value?: Lock},
    configReference: {value?: OneShotSingleDeployConfigClass},
  ): Pipeline<OneShotSingleDeployContext>;
}
