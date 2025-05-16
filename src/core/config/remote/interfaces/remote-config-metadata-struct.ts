// SPDX-License-Identifier: Apache-2.0

import {type DeploymentStates} from '../enumerations/deployment-states.js';
import {type MigrationStruct} from './migration-struct.js';
import {type DeploymentName, type NamespaceNameAsString, type Version} from '../../../../types/index.js';
import {type UserIdentitySchema} from '../../../../data/schema/model/common/user-identity-schema.js';

export interface RemoteConfigMetadataStruct {
  namespace: NamespaceNameAsString;
  state: DeploymentStates;
  deploymentName: DeploymentName;
  lastUpdatedAt: Date;
  lastUpdateBy: UserIdentitySchema;
  soloVersion: Version;
  soloChartVersion: Version;
  hederaPlatformVersion: Version;
  hederaMirrorNodeChartVersion: Version;
  explorerChartVersion: Version;
  hederaJsonRpcRelayChartVersion: Version;
  migration?: MigrationStruct;
}
