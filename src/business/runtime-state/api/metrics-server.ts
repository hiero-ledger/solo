// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type Context} from '../../../types/index.js';
import {type AggregatedMetrics} from '../model/aggregated-metrics.js';

export interface MetricsServer {
  getMetrics(
    snapshotName: string,
    namespace?: NamespaceName,
    labelSelector?: string,
    contexts?: Context[],
  ): Promise<AggregatedMetrics>;
  logMetrics(
    snapshotName: string,
    metricsLogFile: string,
    namespace?: NamespaceName,
    labelSelector?: string,
    contexts?: Context[],
  ): Promise<void>;
}
