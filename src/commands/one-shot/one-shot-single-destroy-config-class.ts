// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';

export interface OneShotSingleDestroyConfigClass {
  clusterRef: string;
  context: string;
  deployment: string;
  namespace: NamespaceName;
  cacheDir: string;
  /**
   * When true, there is nothing at all to destroy (no deployment in local config);
   * the whole pipeline is a no-op.
   */
  skipAll: boolean;
  /**
   * When true, the cluster/remote ConfigMap is unreachable or missing, so cluster-side teardown
   * (mirror/block/consensus/cluster) is skipped, but local-config cleanup still runs.
   */
  skipClusterCleanup: boolean;
  hasExplorers: boolean;
  hasRelays: boolean;
  hasMirrorNodes: boolean;
  hasBlockNodes: boolean | undefined;
}
