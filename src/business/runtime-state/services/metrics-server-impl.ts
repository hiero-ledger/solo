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

@injectable()
export class MetricsServerImpl implements MetricsServer {
  public constructor(public logger?: SoloLogger) {
    this.logger = patchInject<SoloLogger>(logger, InjectTokens.SoloLogger, this.constructor.name);
  }
  public async getMetrics(
    namespaceLookup: NamespaceName = undefined,
    context: Context = undefined,
  ): Promise<PodMetrics[]> {
    const podMetrics: PodMetrics[] = [];
    const namespaceParameter: string = namespaceLookup ? `-n ${namespaceLookup.name}` : '-A';
    const contextParameter: string = context ? `--context ${context}` : '';
    const cmd: string = `kubectl top pod ${namespaceParameter} --no-headers=true ${contextParameter}`;
    try {
      const results: string[] = await new ShellRunner().run(cmd, [], true, false);
      let namespace: string;
      let podName: string;
      let cpuInMillicores: number;
      let memoryInMebibytes: number;
      let carryOver: boolean = false;
      for (const result of results) {
        const resultArray: string[] = result.trim().split(/\r?\n| +/);
        if (carryOver && resultArray.length === 1) {
          memoryInMebibytes = +resultArray[0].split('Mi')[0];
          podMetrics.push(
            new PodMetrics(NamespaceName.of(namespace), PodName.of(podName), cpuInMillicores, memoryInMebibytes),
          );
          carryOver = false;
        } else {
          namespace = resultArray[0];
          podName = resultArray[1];
          cpuInMillicores = +resultArray[2].split('m')[0];
          if (resultArray.length === 4) {
            memoryInMebibytes = +resultArray[3].split('Mi')[0];
            podMetrics.push(
              new PodMetrics(NamespaceName.of(namespace), PodName.of(podName), cpuInMillicores, memoryInMebibytes),
            );
          } else {
            carryOver = true;
          }
        }
      }
      return podMetrics;
    } catch (error) {
      if (error.message.includes('Metrics API not available')) {
        this.logger.showUser('Metrics API not available for reporting metrics');
      }
      this.logger.debug(error.message, error);
      return [];
    }
  }
}
