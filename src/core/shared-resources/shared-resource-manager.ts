// SPDX-License-Identifier: Apache-2.0

import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {inject, injectable} from 'tsyringe-neo';
import {type HelmClient} from '../../integration/helm/helm-client.js';
import {type ChartManager} from '../chart-manager.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import * as constants from '../../core/constants.js';
import {HelmChartValue, HelmChartValues} from '../../integration/helm/model/values.js';

@injectable()
export class SharedResourceManager {
  private postgresEnabled: boolean = false;
  private redisEnabled: boolean = false;
  private additionalChartValues: HelmChartValues = new HelmChartValues();

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.Helm) protected readonly helm?: HelmClient,
    @inject(InjectTokens.ChartManager) protected readonly chartManager?: ChartManager,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
  }

  public setAdditionalValuesArgument(additionalArguments: string): void {
    this.additionalChartValues = SharedResourceManager.parseAdditionalValuesArgument(additionalArguments);
  }

  public setAdditionalChartValues(additionalChartValues: HelmChartValues): void {
    this.additionalChartValues = additionalChartValues;
  }

  public enablePostgres(): void {
    this.postgresEnabled = true;
  }

  public enableRedis(): void {
    this.redisEnabled = true;
  }

  public async uninstallChart(namespace: NamespaceName, context?: string): Promise<void> {
    const isChartInstalled: boolean = await this.chartManager.isChartInstalled(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      context,
    );

    if (!isChartInstalled) {
      this.logger?.info(
        `Shared resources chart is not installed in namespace ${namespace.name}, skipping uninstallation.`,
      );
      return;
    }

    await this.chartManager.uninstall(namespace, constants.SOLO_SHARED_RESOURCES_CHART, context);
  }

  /**
   *  Installs the shared resources chart in the specified namespace if it is not already installed.
   *  Returns true if the chart was installed, false if it was already installed.
   * @param namespace
   * @param chartDirectory
   * @param soloChartVersion
   * @param context
   * @param valuesArgumentsMap
   */
  public async installChart(
    namespace: NamespaceName,
    chartDirectory: string,
    soloChartVersion: string,
    context?: string,
    valuesArgumentsMap?: Record<string, HelmChartValue>,
  ): Promise<boolean> {
    const isChartInstalled: boolean = await this.chartManager.isChartInstalled(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      context,
    );

    if (isChartInstalled) {
      this.logger?.info(
        `Shared resources chart is already installed in namespace ${namespace.name}, skipping installation.`,
      );
      return false;
    }

    valuesArgumentsMap = {
      ...valuesArgumentsMap,
      'postgresql.enabled': this.postgresEnabled,
      'redis.enabled': this.redisEnabled,
    };

    const chartValues: HelmChartValues = new HelmChartValues()
      .setMany(valuesArgumentsMap)
      .add(this.additionalChartValues);

    this.additionalChartValues = new HelmChartValues();

    await this.chartManager.install(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      constants.SOLO_SHARED_RESOURCES_CHART,
      chartDirectory || constants.SOLO_TESTING_CHART_URL,
      soloChartVersion,
      chartValues,
      context,
    );

    return true;
  }

  private static parseAdditionalValuesArgument(additionalArguments: string): HelmChartValues {
    const chartValues: HelmChartValues = new HelmChartValues();

    if (!additionalArguments) {
      return chartValues;
    }

    const tokens: string[] = SharedResourceManager.tokenizeHelmArguments(additionalArguments);

    for (let index = 0; index < tokens.length; index++) {
      const argument: string = tokens[index];

      if (argument === '--set') {
        const value: string = tokens[++index];
        if (!value) {
          throw new Error('Missing value for --set in shared resources additional values arguments');
        }
        chartValues.setValues.push(value);
        continue;
      }

      if (argument.startsWith('--set=')) {
        chartValues.setValues.push(argument.slice('--set='.length));
        continue;
      }

      if (argument === '--set-literal') {
        const value: string = tokens[++index];
        if (!value) {
          throw new Error('Missing value for --set-literal in shared resources additional values arguments');
        }
        chartValues.setLiteralValues.push(value);
        continue;
      }

      if (argument.startsWith('--set-literal=')) {
        chartValues.setLiteralValues.push(argument.slice('--set-literal='.length));
        continue;
      }

      if (argument === '--set-file') {
        const value: string = tokens[++index];
        if (!value) {
          throw new Error('Missing value for --set-file in shared resources additional values arguments');
        }
        chartValues.setFileValues.push(value);
        continue;
      }

      if (argument.startsWith('--set-file=')) {
        chartValues.setFileValues.push(argument.slice('--set-file='.length));
        continue;
      }

      if (argument === '--values' || argument === '-f') {
        const value: string = tokens[++index];
        if (!value) {
          throw new Error(`Missing value for ${argument} in shared resources additional values arguments`);
        }
        chartValues.file(value);
        continue;
      }

      if (argument.startsWith('--values=')) {
        chartValues.file(argument.slice('--values='.length));
        continue;
      }

      throw new Error(`Unsupported shared resources additional Helm argument: ${argument}`);
    }

    return chartValues;
  }

  private static tokenizeHelmArguments(argumentsString: string): string[] {
    const tokens: string[] = [];
    let currentToken: string = '';
    let quote: '"' | "'" | undefined;
    let escaping: boolean = false;

    for (const character of argumentsString) {
      if (escaping) {
        currentToken += character;
        escaping = false;
        continue;
      }

      if (character === '\\') {
        escaping = true;
        continue;
      }

      if (quote) {
        if (character === quote) {
          quote = undefined;
        } else {
          currentToken += character;
        }
        continue;
      }

      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }

      if (/\s/.test(character)) {
        if (currentToken.length > 0) {
          tokens.push(currentToken);
          currentToken = '';
        }
        continue;
      }

      currentToken += character;
    }

    if (escaping) {
      currentToken += '\\';
    }

    if (quote) {
      throw new Error(`Unclosed quote in shared resources additional Helm arguments: ${argumentsString}`);
    }

    if (currentToken.length > 0) {
      tokens.push(currentToken);
    }

    return tokens;
  }
}
