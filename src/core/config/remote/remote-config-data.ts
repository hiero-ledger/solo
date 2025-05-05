// SPDX-License-Identifier: Apache-2.0

import {type RemoteConfigMetadata} from './metadata.js';
import {type ComponentsDataWrapper} from './components-data-wrapper.js';
import {type ApplicationVersions} from '../../../data/schema/model/common/application-versions.js';
import {type Cluster} from '../../../data/schema/model/common/cluster.js';
import {type DeploymentHistory} from '../../../data/schema/model/remote/deployment-history.js';

export interface RemoteConfigData {
  schemaVersion: number;
  metadata: RemoteConfigMetadata;
  versions: ApplicationVersions;
  clusters: Cluster[];
  state: ComponentsDataWrapper;
  history: DeploymentHistory;
}
