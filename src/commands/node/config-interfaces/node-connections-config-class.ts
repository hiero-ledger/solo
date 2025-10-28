// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type Context, type DeploymentName, type Optional} from '../../../types/index.js';
import {type ComponentData} from '../tasks.js';

export interface NodeConnectionsConfigClass {
  deployment: DeploymentName;
  componentsData: ComponentData[];
  context: Context;
  namespace: NamespaceName;
  newAccount: Optional<{
    accountId: string;
    privateKey: string;
    publicKey: string;
    balance: number;
    accountAlias?: string;
  }>;
}
