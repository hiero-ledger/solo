// SPDX-License-Identifier: Apache-2.0

import {type ArgvStruct} from '../../../types/aliases.js';
import {type SoloListr} from '../../../types/index.js';
import {type SoloListrTaskWrapper} from '../../../types/index.js';
import {type OneShotSingleDeployConfigClass} from '../one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../one-shot-single-deploy-context.js';

export interface OneShotDeployOrchestrator {
  buildDeployTaskList(
    config: OneShotSingleDeployConfigClass,
    argv: ArgvStruct,
    parentTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
  ): SoloListr<OneShotSingleDeployContext>;
}
