// SPDX-License-Identifier: Apache-2.0

import {type K8} from '../integration/kube/k8.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';

export interface ResolveGossipFqdnRestrictedOptions {
  k8?: K8;
  namespace?: NamespaceName;
  stagingDir?: string;
  cacheDir?: string;
  resourcesDir?: string;
  applicationPropertiesPath?: string;
}
