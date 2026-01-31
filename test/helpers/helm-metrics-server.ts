// SPDX-License-Identifier: Apache-2.0

import {type ChartManager} from '../../src/core/chart-manager.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../src/types/namespace/namespace-name.js';
import {type K8ClientFactory} from '../../src/integration/kube/k8-client/k8-client-factory.js';

export class HelmMetricsServer {
  public static readonly NAMESPACE: NamespaceName = NamespaceName.of('kube-system');
  public static readonly CHART_RELEASE_NAME: string = 'metrics-server';
  public static readonly CHART_NAME: string = 'metrics-server/metrics-server';
  public static readonly REPOSITORY_NAME: string = 'metrics-server';
  public static readonly REPOSITORY_URL: string = 'https://kubernetes-sigs.github.io/metrics-server/';
  public static readonly INSTALL_ARGS: string = '--kubelet-insecure-tls';
  public static readonly VERSION: string = ''; // latest version

  public static async installMetricsServer(testName: string): Promise<void> {
    try {
      const k8Factory: K8ClientFactory = container.resolve<K8ClientFactory>(InjectTokens.K8Factory);
      const chartManager: ChartManager = container.resolve<ChartManager>(InjectTokens.ChartManager);
      await chartManager.addRepo(this.REPOSITORY_NAME, this.REPOSITORY_URL, true);
      await chartManager.install(
        this.NAMESPACE,
        this.CHART_RELEASE_NAME,
        this.CHART_NAME,
        this.REPOSITORY_NAME,
        this.VERSION,
        this.INSTALL_ARGS,
        k8Factory.default().contexts().readCurrent(),
      );
    } catch (error) {
      throw new Error(`${testName}: failed to install metrics-server: ${(error as Error).message}`);
    }
  }
}
