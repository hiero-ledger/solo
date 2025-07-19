// SPDX-License-Identifier: Apache-2.0

import {type ListrContext} from 'listr2';
import {type QuickStartSingleDeployConfigClass} from './quick-start-single-deploy-config-class.js';
import {type CreatedPredefinedAccount} from './predefined-accounts.js';

export interface QuickStartSingleDeployContext extends ListrContext {
  config: QuickStartSingleDeployConfigClass;
  createdAccounts: CreatedPredefinedAccount[];
}
