// SPDX-License-Identifier: Apache-2.0

import {Metrics} from './metrics.js';
import {type ClusterMetrics} from './cluster-metrics.js';

export class AggregatedMetrics extends Metrics {
  public constructor(
    public readonly clusterMetrics: ClusterMetrics[],
    cpuInMillicores: number,
    memoryInMebibytes: number,
  ) {
    super(cpuInMillicores, memoryInMebibytes);
  }

  public override toString(): string {
    let outputString: string =
      `{"cpuInMillicores": ${this.cpuInMillicores}, ` +
      `"memoryInMebibytes": ${this.memoryInMebibytes}, ` +
      '"clusterMetrics": [';
    for (let index: number = 0; index < this.clusterMetrics?.length; index++) {
      outputString += this.clusterMetrics[index].toString();
      if (index + 1 < this.clusterMetrics.length) {
        outputString += ', ';
      }
    }

    return `${outputString}]}`;
  }
}
