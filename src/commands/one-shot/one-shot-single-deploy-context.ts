// SPDX-License-Identifier: Apache-2.0

import {type ListrContext} from 'listr2';
import {type OneShotSingleDeployConfigClass} from './one-shot-single-deploy-config-class.js';
import {type CreatedPredefinedAccount} from './predefined-accounts.js';

export interface OneShotSingleDeployContext extends ListrContext {
  config: OneShotSingleDeployConfigClass;
  createdAccounts: CreatedPredefinedAccount[];
}
