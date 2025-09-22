// SPDX-License-Identifier: Apache-2.0

import {type ListrContext} from 'listr2';
import {type OneShotMultipleDeployConfigClass} from './one-shot-multiple-deploy-config-class.js';
import {type CreatedPredefinedAccount} from './predefined-accounts.js';

export interface OneShotMultipleDeployContext extends ListrContext {
  config: OneShotMultipleDeployConfigClass;
  createdAccounts: CreatedPredefinedAccount[];
}
