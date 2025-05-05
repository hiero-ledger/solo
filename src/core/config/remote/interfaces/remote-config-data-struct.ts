// SPDX-License-Identifier: Apache-2.0

import {type ClusterStruct} from './cluster-struct.js';
import {type RemoteConfigCommonFlagsStruct} from './remote-config-common-flags-struct.js';
import {type ClusterReference, type Version} from '../types.js';
import {type ComponentsDataStruct} from './components-data-struct.js';
import {type RemoteConfigMetadata} from '../../../../data/schema/model/remote/remote-config-metadata.js';

export interface RemoteConfigDataStruct {
  metadata: RemoteConfigMetadata;
  version: Version;
  clusters: Record<ClusterReference, ClusterStruct>;
  components: ComponentsDataStruct;
  commandHistory: string[];
  lastExecutedCommand: string;
  flags: RemoteConfigCommonFlagsStruct;
}
