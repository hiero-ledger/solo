// SPDX-License-Identifier: Apache-2.0

import {type ListrContext} from 'listr2';
import {type QuickStartSingleDeployConfigClass} from './quick-start-single-deploy-config-class.js';

export interface QuickStartSingleDeployContext extends ListrContext {
  config: QuickStartSingleDeployConfigClass;
}
