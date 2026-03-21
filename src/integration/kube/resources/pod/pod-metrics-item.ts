// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type PodName} from './pod-name.js';

export interface PodMetricsItem {
  readonly namespace: NamespaceName;
  readonly podName: PodName;
  readonly cpuInMillicores: number;
  readonly memoryInMebibytes: number;
}
