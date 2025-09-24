// SPDX-License-Identifier: Apache-2.0

import {type PodMetrics} from '../model/pod-metrics.js';

export interface MetricsServer {
  getMetrics(): Promise<PodMetrics[]>;
}
