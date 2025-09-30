// SPDX-License-Identifier: Apache-2.0

import {Metrics} from './metrics.js';
import {type PodMetrics} from './pod-metrics.js';
import {type Context} from '../../../types/index.js';

export class ClusterMetrics extends Metrics {
  public constructor(
    public readonly context: Context,
    public readonly podMetrics: PodMetrics[],
    cpuInMillicores: number,
    memoryInMebibytes: number,
  ) {
    super(cpuInMillicores, memoryInMebibytes);
  }

  public override toString(): string {
    let outputString: string =
      `{"context": "${this.context}", ` +
      `"cpuInMillicores": ${this.cpuInMillicores}, ` +
      `"memoryInMebibytes": ${this.memoryInMebibytes}, ` +
      '"podMetrics": [';
    for (let index: number = 0; index < this.podMetrics.length; index++) {
      outputString += this.podMetrics[index].toString();
      if (index + 1 < this.podMetrics.length) {
        outputString += ', ';
      }
    }

    return `${outputString}]}`;
  }
}
