// SPDX-License-Identifier: Apache-2.0

import {PodMetrics} from '../model/pod-metrics.js';
import {type MetricsServer} from '../api/metrics-server.js';
import {NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type Context} from '../../../types/index.js';
import {ShellRunner} from '../../../core/shell-runner.js';
import {PodName} from '../../../integration/kube/resources/pod/pod-name.js';
import {inject, injectable} from 'tsyringe-neo';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import {AggregatedMetrics} from '../model/aggregated-metrics.js';
import {ClusterMetrics} from '../model/cluster-metrics.js';
import yaml from 'yaml';
import {type K8Factory} from '../../../integration/kube/k8-factory.js';
import {ContainerReference} from '../../../integration/kube/resources/container/container-reference.js';
import {ContainerName} from '../../../integration/kube/resources/container/container-name.js';
import {PodReference} from '../../../integration/kube/resources/pod/pod-reference.js';

@injectable()
export class MetricsServerImpl implements MetricsServer {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
  }

  public async getMetrics(
    snapshotName: string,
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
    return this.createAggregatedMetrics(snapshotName, clusterMetrics);
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
      let clusterNamespace: string = '';
      let mirrorNodePostgresPodName: string = undefined;
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
        if (podName.startsWith('network-node1-0')) {
          clusterNamespace = namespace;
        }
        if (podName.includes('postgres')) {
          mirrorNodePostgresPodName = podName;
        }
      }
      return this.createClusterMetrics(
        context ?? 'default',
        NamespaceName.of(clusterNamespace),
        podMetrics,
        mirrorNodePostgresPodName ? PodName.of(mirrorNodePostgresPodName) : undefined,
      );
    } catch (error) {
      if (error.message.includes('Metrics API not available')) {
        this.logger.showUser('Metrics API not available for reporting metrics');
        return undefined;
      }
      throw error;
    }
  }

  private async createAggregatedMetrics(
    snapshotName: string,
    clusterMetrics: ClusterMetrics[],
  ): Promise<AggregatedMetrics> {
    if (!clusterMetrics || clusterMetrics?.length === 0) {
      return undefined;
    }

    let cpuInMillicores: number = 0;
    let memoryInMebibytes: number = 0;
    let runtime: number = 0;
    let transactions: number = 0;
    for (const clusterMetric of clusterMetrics) {
      cpuInMillicores += clusterMetric.cpuInMillicores;
      memoryInMebibytes += clusterMetric.memoryInMebibytes;
      runtime += await this.getNetworkNodeRuntime(clusterMetric.namespace, clusterMetric.context);
      transactions += await this.getNetworkTransactions(
        clusterMetric.namespace,
        clusterMetric.context,
        clusterMetric.postgresPodName,
      );
    }

    return new AggregatedMetrics(
      snapshotName,
      clusterMetrics,
      cpuInMillicores,
      memoryInMebibytes,
      runtime,
      transactions,
    );
  }

  private createClusterMetrics(
    context: Context,
    namespace: NamespaceName,
    podMetrics: PodMetrics[],
    mirrorNodePostgresPodName: PodName,
  ): ClusterMetrics {
    if (!podMetrics || podMetrics?.length === 0) {
      return undefined;
    }

    let cpuInMillicores: number = 0;
    let memoryInMebibytes: number = 0;
    for (const podMetric of podMetrics) {
      cpuInMillicores += podMetric.cpuInMillicores;
      memoryInMebibytes += podMetric.memoryInMebibytes;
    }
    return new ClusterMetrics(
      context,
      namespace,
      podMetrics,
      mirrorNodePostgresPodName,
      cpuInMillicores,
      memoryInMebibytes,
    );
  }

  public async logMetrics(
    snapshotName: string,
    metricsLogFile: string,
    namespace?: NamespaceName,
    labelSelector?: string,
    contexts?: Context[],
  ): Promise<void> {
    const aggregatedMetrics: AggregatedMetrics = await this.getMetrics(
      snapshotName,
      namespace,
      labelSelector,
      contexts,
    );

    fs.writeFileSync(`${metricsLogFile}.json`, aggregatedMetrics ? aggregatedMetrics.toString() : '');
    fs.writeFileSync(`${metricsLogFile}.yaml`, aggregatedMetrics ? yaml.stringify(aggregatedMetrics) : '');
  }

  private async getNetworkNodeRuntime(namespace: NamespaceName, context: Context): Promise<number> {
    const contextParameter: string = context && context !== 'default' ? `--context ${context}` : '';
    const cmd: string = `kubectl get pod network-node1-0 -n ${namespace.name} --no-headers ${contextParameter} | awk '{print $5}'`;
    const results: string[] = await new ShellRunner().run(cmd, [], true, false);
    if (results?.length > 0) {
      return Number.parseInt(results[0].split('m')[0]);
    }
    return 0;
  }

  private async getNetworkTransactions(
    namespace: NamespaceName,
    context: Context,
    postgresPodName: PodName,
  ): Promise<number> {
    try {
      const result: string = await this.k8Factory
        .getK8(context && context !== 'default' ? context : undefined)
        .containers()
        .readByRef(ContainerReference.of(PodReference.of(namespace, postgresPodName), ContainerName.of('postgresql')))
        .execContainer([
          'bash',
          '-c',
          "PGPASSWORD=$(cat $POSTGRES_PASSWORD_FILE) psql -U postgres -d mirror_node -c 'select count(*) from transaction;' -t",
        ]);
      return Number.parseInt(result.trim());
    } catch (error) {
      this.logger.debug(`error looking up transactions: ${error.message}`, error);
    }
    return 0;
  }
}
