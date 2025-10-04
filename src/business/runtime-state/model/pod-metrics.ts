// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type PodName} from '../../../integration/kube/resources/pod/pod-name.js';
import {Metrics} from './metrics.js';

export class PodMetrics extends Metrics {
  public constructor(
    public readonly namespace: NamespaceName,
    public readonly podName: PodName,
    cpuInMillicores: number,
    memoryInMebibytes: number,
  ) {
    super(cpuInMillicores, memoryInMebibytes);
  }

  public override toString(): string {
    return (
      `{"namespace": "${this.namespace.name}", ` +
      `"podName": "${this.podName.name}", ` +
      `"cpuInMillicores": ${this.cpuInMillicores}, ` +
      `"memoryInMebibytes": ${this.memoryInMebibytes}}`
    );
  }
}
