// SPDX-License-Identifier: Apache-2.0

import {Metrics} from './metrics.js';
import {type ClusterMetrics} from './cluster-metrics.js';
import {type RemoteConfigRuntimeState} from '../config/remote/remote-config-runtime-state.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {ComponentTypes} from '../../../core/config/remote/enumerations/component-types.js';
import {type SemVer} from 'semver';

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
    public readonly soloVersion?: SemVer,
    public readonly soloChartVersion?: SemVer,
    public readonly consensusNodeVersion?: SemVer,
    public readonly mirrorNodeVersion?: SemVer,
    public readonly blockNodeVersion?: SemVer,
    public readonly relayVersion?: SemVer,
    public readonly explorerVersion?: SemVer,
  ) {
    super(cpuInMillicores, memoryInMebibytes);
    this.date = new Date();
    this.gitHubSha = process.env.GITHUB_SHA;
    const remoteConfigRuntimeState: RemoteConfigRuntimeState = container.resolve(InjectTokens.RemoteConfigRuntimeState);
    this.soloVersion = remoteConfigRuntimeState.getComponentVersion(ComponentTypes.Cli);
    this.soloChartVersion = remoteConfigRuntimeState.getComponentVersion(ComponentTypes.Chart);
    this.consensusNodeVersion = remoteConfigRuntimeState.getComponentVersion(ComponentTypes.ConsensusNode);
    this.mirrorNodeVersion = remoteConfigRuntimeState.getComponentVersion(ComponentTypes.MirrorNode);
    this.blockNodeVersion = remoteConfigRuntimeState.getComponentVersion(ComponentTypes.BlockNode);
    this.relayVersion = remoteConfigRuntimeState.getComponentVersion(ComponentTypes.RelayNodes);
    this.explorerVersion = remoteConfigRuntimeState.getComponentVersion(ComponentTypes.Explorer);
  }

  public override toString(): string {
    let outputString: string =
      `{"snapshotName": "${this.snapshotName}", ` +
      `"date": "${this.date.toISOString()}", ` +
      `"gitHubSha": "${this.gitHubSha}", ` +
      `"soloVersion": "${this.soloVersion}", ` +
      `"soloChartVersion": "${this.soloChartVersion}", ` +
      `"consensusNodeVersion": "${this.consensusNodeVersion}", ` +
      `"mirrorNodeVersion": "${this.mirrorNodeVersion}", ` +
      `"blockNodeVersion": "${this.blockNodeVersion}", ` +
      `"relayVersion": "${this.relayVersion}", ` +
      `"explorerVersion": "${this.explorerVersion}", ` +
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
