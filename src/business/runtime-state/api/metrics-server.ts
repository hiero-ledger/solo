// SPDX-License-Identifier: Apache-2.0

import {type PodMetrics} from '../model/pod-metrics.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type Context} from '../../../types/index.js';

export interface MetricsServer {
  getMetrics(namespace?: NamespaceName, labelSelector?: string, context?: Context): Promise<PodMetrics[]>;
  logMetrics(
    metricsLogFile: string,
    namespace?: NamespaceName,
    labelSelector?: string,
    context?: Context,
  ): Promise<void>;
}
