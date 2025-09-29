// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type Context} from '../../../types/index.js';
import {type AggregatedMetrics} from '../model/aggregrated-metrics.js';

export interface MetricsServer {
  getMetrics(namespace?: NamespaceName, labelSelector?: string, contexts?: Context[]): Promise<AggregatedMetrics>;
  logMetrics(
    metricsLogFile: string,
    namespace?: NamespaceName,
    labelSelector?: string,
    contexts?: Context[],
  ): Promise<void>;
}
