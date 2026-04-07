// SPDX-License-Identifier: Apache-2.0

import {type DeploymentName} from '../../types/index.js';
import {type Deployment} from '../../business/runtime-state/config/local/deployment.js';
import {type RemoteConfigStructure} from '../../data/schema/model/remote/interfaces/remote-config-structure.js';

export interface OneShotInfoContext {
  deploymentName: DeploymentName;
  clusterConnected: boolean;
  deployment: Deployment;
  remoteConfig: RemoteConfigStructure;
}
