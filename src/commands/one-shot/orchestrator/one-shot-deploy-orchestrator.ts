// SPDX-License-Identifier: Apache-2.0

import {type SoloListr} from '../../../types/index.js';
import {type SoloListrTaskWrapper} from '../../../types/index.js';
import {type OneShotSingleDeployConfigClass} from '../one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../one-shot-single-deploy-context.js';

export interface OneShotDeployOrchestrator {
  buildDeployTaskList(
    config: OneShotSingleDeployConfigClass,
    parentTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
  ): SoloListr<OneShotSingleDeployContext>;
}
