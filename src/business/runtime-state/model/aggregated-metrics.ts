// SPDX-License-Identifier: Apache-2.0

import {Metrics} from './metrics.js';
import {type ClusterMetrics} from './cluster-metrics.js';

export class AggregatedMetrics extends Metrics {
  public constructor(
    public readonly snapshotName: string,
    public readonly clusterMetrics: ClusterMetrics[],
    cpuInMillicores: number,
    memoryInMebibytes: number,
    public readonly runtimeInMinutes: number,
    public readonly transactionCount: number,
    public readonly date?: Date,
    public readonly gitHubSha?: string,
  ) {
    super(cpuInMillicores, memoryInMebibytes);
    this.date = new Date();
    this.gitHubSha = process.env.GITHUB_SHA;
  }

  public override toString(): string {
    let outputString: string =
      `{"snapshotName": "${this.snapshotName}", ` +
      `"date": "${this.date.toISOString()}", ` +
      `"gitHubSha": "${this.gitHubSha}", ` +
      `"cpuInMillicores": ${this.cpuInMillicores}, ` +
      `"memoryInMebibytes": ${this.memoryInMebibytes}, ` +
      `"runtimeInMinutes": ${this.runtimeInMinutes}, ` +
      `"transactionCount": ${this.transactionCount}, ` +
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
