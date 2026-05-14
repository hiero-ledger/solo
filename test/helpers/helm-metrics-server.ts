// SPDX-License-Identifier: Apache-2.0

import {type ChartManager} from '../../src/core/chart-manager.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type K8ClientFactory} from '../../src/integration/kube/k8-client/k8-client-factory.js';
import * as constants from '../../src/core/constants.js';

export class HelmMetricsServer {
  public static readonly REPOSITORY_NAME: string = constants.METRICS_SERVER_CHART;
  public static readonly REPOSITORY_URL: string = constants.METRICS_SERVER_CHART_URL;
  public static readonly VERSION: string = ''; // latest version

  public static async installMetricsServer(testName: string): Promise<void> {
    try {
      const k8Factory: K8ClientFactory = container.resolve<K8ClientFactory>(InjectTokens.K8Factory);
      const chartManager: ChartManager = container.resolve<ChartManager>(InjectTokens.ChartManager);
      await chartManager.addRepo(this.REPOSITORY_NAME, this.REPOSITORY_URL, true);
      await chartManager.install(
        constants.METRICS_SERVER_NAMESPACE,
        constants.METRICS_SERVER_RELEASE_NAME,
        constants.METRICS_SERVER_CHART,
        this.REPOSITORY_NAME,
        this.VERSION,
        constants.METRICS_SERVER_INSTALL_ARGS,
        k8Factory.default().contexts().readCurrent(),
      );
    } catch (error) {
      throw new Error(`${testName}: failed to install metrics-server: ${(error as Error).message}`);
    }
  }
}
