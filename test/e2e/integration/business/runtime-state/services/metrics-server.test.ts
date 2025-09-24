// SPDX-License-Identifier: Apache-2.0

import {MetricsServerImpl} from '../../../../../../src/business/runtime-state/services/metrics-server-impl.js';
import {type MetricsServer} from '../../../../../../src/business/runtime-state/api/metrics-server.js';
import {expect} from 'chai';

describe('MetricsServer', (): void => {
  describe('getMetrics', (): void => {
    it('should succeed', async (): Promise<void> => {
      const metricsServer: MetricsServer = new MetricsServerImpl();
      expect(await metricsServer.getMetrics()).to.not.be.null;
    });
  });
});
