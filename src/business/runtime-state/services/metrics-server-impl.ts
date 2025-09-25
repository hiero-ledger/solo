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

@injectable()
export class MetricsServerImpl implements MetricsServer {
  public constructor(public logger?: SoloLogger) {
    this.logger = patchInject<SoloLogger>(logger, InjectTokens.SoloLogger, this.constructor.name);
  }
  public async getMetrics(
    namespaceLookup: NamespaceName = undefined,
    labelSelector: string = undefined,
    context: Context = undefined,
  ): Promise<PodMetrics[]> {
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
      return podMetrics;
    } catch (error) {
      if (error.message.includes('Metrics API not available')) {
        this.logger.showUser('Metrics API not available for reporting metrics');
        return [];
      }
      throw error;
    }
  }

  public async logMetrics(
    metricsLogFile: string,
    namespace?: NamespaceName,
    labelSelector?: string,
    context?: Context,
  ): Promise<void> {
    const metrics: PodMetrics[] = await this.getMetrics(namespace, labelSelector, context);
    let cpuInMillicores: number = 0;
    let memoryInMebibytes: number = 0;
    let outputString: string = '{"podMetrics": [';
    for (let index: number = 0; index < metrics.length; index++) {
      outputString += `${metrics[index].toString()}`;
      cpuInMillicores += metrics[index].cpuInMillicores;
      memoryInMebibytes += metrics[index].memoryInMebibytes;

      if (index + 1 < metrics.length) {
        outputString += ',';
      }
    }
    outputString += ']';
    outputString += `, "totalCpuInMillicores": ${cpuInMillicores}, "memoryInMebibytes": ${memoryInMebibytes}}`;
    fs.writeFileSync(metricsLogFile, outputString);
  }
}
