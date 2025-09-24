// SPDX-License-Identifier: Apache-2.0

import {MetricsServerImpl} from '../../../../../../src/business/runtime-state/services/metrics-server-impl.js';
import {type MetricsServer} from '../../../../../../src/business/runtime-state/api/metrics-server.js';
import {expect} from 'chai';
import {type PodMetrics} from '../../../../../../src/business/runtime-state/model/pod-metrics.js';
import {PathEx} from '../../../../../../src/business/utils/path-ex.js';
import * as constants from '../../../../../../src/core/constants.js';

describe('MetricsServer', (): void => {
  describe('getMetrics', (): void => {
    it('should succeed', async (): Promise<void> => {
      const metricsServer: MetricsServer = new MetricsServerImpl();
      const metrics: PodMetrics[] = await metricsServer.getMetrics(undefined, 'app.kubernetes.io/instance=mirror-1');
      expect(metrics.length).to.be.greaterThan(0);
    });
  });
  describe('logMetrics', (): void => {
    it('should succeed', async (): Promise<void> => {
      const metricsServer: MetricsServer = new MetricsServerImpl();
      await metricsServer.logMetrics(
        PathEx.join(constants.SOLO_LOGS_DIR, 'metrics.json'),
        undefined,
        'app.kubernetes.io/instance=mirror-1',
      );
    });
  });
});
