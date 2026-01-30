// SPDX-License-Identifier: Apache-2.0

import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {inject, injectable} from 'tsyringe-neo';
import {type HelmClient} from '../../integration/helm/helm-client.js';
import {type ChartManager} from '../chart-manager.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import * as constants from '../../core/constants.js';

@injectable()
export class SharedResourceManager {
  private postgresEnabled: boolean = false;
  private redisEnabled: boolean = false;

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig?: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig?: LocalConfigRuntimeState,
    @inject(InjectTokens.Helm) protected readonly helm?: HelmClient,
    @inject(InjectTokens.ChartManager) protected readonly chartManager?: ChartManager,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
  }

  public enablePostgres(): void {
    this.postgresEnabled = true;
  }

  public enableRedis(): void {
    this.redisEnabled = true;
  }

  public disablePostgres(): void {
    this.postgresEnabled = false;
  }

  public disableRedis(): void {
    this.redisEnabled = false;
  }

  public async installChart(
    namespace: NamespaceName,
    chartDirectory: string,
    soloChartVersion: string,
    context?: string,
    valuesArgumentsMap?: Record<string, string>,
  ): Promise<void> {
    const isChartInstalled: boolean = await this.chartManager.isChartInstalled(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      context,
    );

    if (isChartInstalled) {
      this.logger?.info(
        `Shared resources chart is already installed in namespace ${namespace.name}, skipping installation.`,
      );
      return;
    } else {
      valuesArgumentsMap = {
        ...valuesArgumentsMap,
        'postgres.enabled': this.postgresEnabled.toString(),
        'redis.enabled': this.redisEnabled.toString(),
      };

      const values: string = Object.entries(valuesArgumentsMap || {})
        .map(([key, value]) => String.raw`--set \"${key}=${value}\"`)
        .join(' ');

      this.chartManager.install(
        namespace,
        constants.SOLO_SHARED_RESOURCES_CHART,
        constants.SOLO_SHARED_RESOURCES_CHART,
        chartDirectory,
        soloChartVersion,
        values,
        context,
      );
    }
  }
}
