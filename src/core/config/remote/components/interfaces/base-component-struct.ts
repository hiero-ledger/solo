// SPDX-License-Identifier: Apache-2.0

import {type ClusterReference, type ComponentName, type NamespaceNameAsString} from '../../../../../types/index.js';

export interface BaseComponentStruct {
  name: ComponentName;
  cluster: ClusterReference;
  namespace: NamespaceNameAsString;
}
