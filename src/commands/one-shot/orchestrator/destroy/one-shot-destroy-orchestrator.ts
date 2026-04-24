// SPDX-License-Identifier: Apache-2.0

import {type SoloListr, type SoloListrTaskWrapper} from '../../../../types/index.js';
import {type OneShotSingleDestroyConfigClass} from '../../one-shot-single-destroy-config-class.js';
import {type OneShotSingleDestroyContext} from '../../one-shot-single-destroy-context.js';

export interface OneShotDestroyOrchestrator {
  buildDestroyTaskList(
    config: OneShotSingleDestroyConfigClass,
    parentTask: SoloListrTaskWrapper<OneShotSingleDestroyContext>,
  ): SoloListr<OneShotSingleDestroyContext>;
}
