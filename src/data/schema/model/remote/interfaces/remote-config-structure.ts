// SPDX-License-Identifier: Apache-2.0

import {type RemoteConfigMetadataSchema} from '../remote-config-metadata-schema.js';
import {type ApplicationVersionsSchema} from '../../common/application-versions-schema.js';
import {type ClusterSchema} from '../../common/cluster-schema.js';
import {type DeploymentStateSchema} from '../deployment-state-schema.js';
import {type DeploymentHistorySchema} from '../deployment-history-schema.js';

export interface RemoteConfigStructure {
  schemaVersion: number;
  metadata: RemoteConfigMetadataSchema;
  versions: ApplicationVersionsSchema;
  clusters: ClusterSchema[];
  state: DeploymentStateSchema;
  history: DeploymentHistorySchema;
}
