// SPDX-License-Identifier: Apache-2.0

import {PodMetrics} from '../model/pod-metrics.js';
import {type MetricsServer} from '../api/metrics-server.js';
import {NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type Context} from '../../../types/index.js';
import {ShellRunner} from '../../../core/shell-runner.js';
import {PodName} from '../../../integration/kube/resources/pod/pod-name.js';
import {injectable} from 'tsyringe-neo';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import {AggregatedMetrics} from '../model/aggregrated-metrics.js';
import {ClusterMetrics} from '../model/cluster-metrics.js';

@injectable()
export class MetricsServerImpl implements MetricsServer {
  public constructor(public logger?: SoloLogger) {
    this.logger = patchInject<SoloLogger>(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public async getMetrics(
    namespaceLookup: NamespaceName = undefined,
    labelSelector: string = undefined,
    contexts: Context[] = undefined,
  ): Promise<AggregatedMetrics> {
    const clusterMetrics: ClusterMetrics[] = [];
    if (!contexts || contexts?.length === 0) {
      const clusterMetric: ClusterMetrics = await this.getClusterMetrics(namespaceLookup, labelSelector);
      if (clusterMetric) {
        clusterMetrics.push(clusterMetric);
      }
    } else {
      for (const context of contexts) {
        const clusterMetric: ClusterMetrics = await this.getClusterMetrics(namespaceLookup, labelSelector, context);
        if (clusterMetric) {
          clusterMetrics.push(clusterMetric);
        }
      }
    }
    return this.createAggregatedMetrics(clusterMetrics);
  }

  private async getClusterMetrics(
    namespaceLookup: NamespaceName = undefined,
    labelSelector: string = undefined,
    context: Context = undefined,
  ): Promise<ClusterMetrics> {
    const podMetrics: PodMetrics[] = [];
    const namespaceParameter: string = namespaceLookup ? `-n ${namespaceLookup.name}` : '-A';
    const contextParameter: string = context ? `--context ${context}` : '';
    const labelSelectorParameter: string = labelSelector ? `-l='${labelSelector}'` : '';
    const cmd: string = `kubectl top pod ${namespaceParameter} --no-headers=true ${contextParameter} ${labelSelectorParameter}`;
    try {
      const results: string[] = await new ShellRunner().run(cmd, [], true, false);
      const joinedResults: string = results.join('\n');
      let namespace: string;
      let podName: string;
      let cpuInMillicores: number;
      let memoryInMebibytes: number;
      let index: number = 0;
      const resultArray: string[] = joinedResults
        .trim()
        .split(/\r?\n|\n| +/)
        .filter((c): boolean => c !== '');
      while (index < resultArray.length) {
        namespace = resultArray[index++];
        podName = resultArray[index++];
        cpuInMillicores = +resultArray[index++].split('m')[0];
        memoryInMebibytes = +resultArray[index++].split('Mi')[0];
        podMetrics.push(
          new PodMetrics(NamespaceName.of(namespace), PodName.of(podName), cpuInMillicores, memoryInMebibytes),
        );
      }
      return this.createClusterMetrics(podMetrics);
    } catch (error) {
      if (error.message.includes('Metrics API not available')) {
        this.logger.showUser('Metrics API not available for reporting metrics');
        return undefined;
      }
      throw error;
    }
  }

  private createAggregatedMetrics(clusterMetrics: ClusterMetrics[]): AggregatedMetrics {
    if (!clusterMetrics || clusterMetrics?.length === 0) {
      return undefined;
    }

    let cpuInMillicores: number = 0;
    let memoryInMebibytes: number = 0;
    for (const clusterMetric of clusterMetrics) {
      cpuInMillicores += clusterMetric.cpuInMillicores;
      memoryInMebibytes += clusterMetric.memoryInMebibytes;
    }
    return new AggregatedMetrics(clusterMetrics, cpuInMillicores, memoryInMebibytes);
  }

  private createClusterMetrics(podMetrics: PodMetrics[]): ClusterMetrics {
    if (!podMetrics || podMetrics?.length === 0) {
      return undefined;
    }

    let cpuInMillicores: number = 0;
    let memoryInMebibytes: number = 0;
    for (const podMetric of podMetrics) {
      cpuInMillicores += podMetric.cpuInMillicores;
      memoryInMebibytes += podMetric.memoryInMebibytes;
    }
    return new ClusterMetrics(podMetrics, cpuInMillicores, memoryInMebibytes);
  }

  public async logMetrics(
    metricsLogFile: string,
    namespace?: NamespaceName,
    labelSelector?: string,
    contexts?: Context[],
  ): Promise<void> {
    const aggregatedMetrics: AggregatedMetrics = await this.getMetrics(namespace, labelSelector, contexts);
    fs.writeFileSync(metricsLogFile, aggregatedMetrics ? aggregatedMetrics.toString() : '');
  }
}
