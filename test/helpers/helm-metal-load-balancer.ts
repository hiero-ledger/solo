// SPDX-License-Identifier: Apache-2.0

import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../src/types/namespace/namespace-name.js';
import {type K8ClientFactory} from '../../src/integration/kube/k8-client/k8-client-factory.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {type ChartManager} from '../../src/core/chart-manager.js';

export class HelmMetalLoadBalancer {
  public static readonly NAMESPACE: NamespaceName = NamespaceName.of('metallb-system');
  public static readonly CHART_RELEASE_NAME: string = 'metallb';
  public static readonly CHART_NAME: string = 'metallb';
  public static readonly REPOSITORY_NAME: string = 'metallb';
  public static readonly REPOSITORY_URL: string = 'https://metallb.github.io/metallb/';
  public static readonly INSTALL_ARGS: string = '--set speaker.frr.enabled=true';
  public static readonly VERSION: string = ''; // latest version

  public static async installMetalLoadBalancer(testName: string): Promise<void> {
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
        true,
        true,
      );
    } catch (error) {
      throw new Error(`${testName}: failed to install metallb: ${(error as Error).message}`, {cause: error});
    }
  }
}
