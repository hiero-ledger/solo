// SPDX-License-Identifier: Apache-2.0

import {type RemoteConfigMetadata} from './metadata.js';
import {type ComponentsDataWrapper} from './components-data-wrapper.js';
import {type CommonFlagsDataWrapper} from './common-flags-data-wrapper.js';
import {type Cluster} from './cluster.js';
import {type ApplicationVersions} from '../../../data/schema/model/common/application-versions.js';

export interface RemoteConfigData {
  schemaVersion: number;
  metadata: RemoteConfigMetadata;
  versions: ApplicationVersions;
  clusters: Cluster[];
  state: ComponentsDataWrapper;
  lastExecutedCommand: string;
  commandHistory: string[];
  flags: CommonFlagsDataWrapper;
}
