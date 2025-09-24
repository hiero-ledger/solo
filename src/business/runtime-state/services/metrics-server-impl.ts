// SPDX-License-Identifier: Apache-2.0

import {type PodMetrics} from '../model/pod-metrics.js';
import {type MetricsServer} from '../api/metrics-server.js';

export class MetricsServerImpl implements MetricsServer {
  public getMetrics(): Promise<PodMetrics[]> {
    return [];
  }
}
