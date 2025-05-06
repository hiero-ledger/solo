// SPDX-License-Identifier: Apache-2.0

import {type DeploymentName} from '../../../../types/index.js';

export interface ClusterStruct {
  name: string;
  namespace: string;
  deployment: DeploymentName;
  dnsBaseDomain: string;
  dnsConsensusNodePattern: string;
}
