// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';

export interface QuickStartSingleDestroyConfigClass {
  clusterRef: string;
  context: string;
  deployment: string;
  namespace: NamespaceName;
  cacheDir: string;
}
