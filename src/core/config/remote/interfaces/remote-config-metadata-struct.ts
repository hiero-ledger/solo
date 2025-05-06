// SPDX-License-Identifier: Apache-2.0

import {type DeploymentStates} from '../enumerations/deployment-states.js';
import {type MigrationStruct} from './migration-struct.js';
import {type DeploymentName, type NamespaceNameAsString, type Version} from '../types.js';
import {type UserIdentity} from '../../../../data/schema/model/common/user-identity.js';

export interface RemoteConfigMetadataStruct {
  namespace: NamespaceNameAsString;
  state: DeploymentStates;
  deploymentName: DeploymentName;
  lastUpdatedAt: Date;
  lastUpdateBy: UserIdentity;
  soloVersion: Version;
  soloChartVersion: Version;
  hederaPlatformVersion: Version;
  hederaMirrorNodeChartVersion: Version;
  hederaExplorerChartVersion: Version;
  hederaJsonRpcRelayChartVersion: Version;
  migration?: MigrationStruct;
}
