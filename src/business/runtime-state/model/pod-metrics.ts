// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type PodName} from '../../../integration/kube/resources/pod/pod-name.js';

export class PodMetrics {
  public constructor(
    public readonly namespace: NamespaceName,
    public readonly podName: PodName,
    public readonly cpuInMillicores: number,
    public readonly memoryInMebibytes: number,
  ) {}

  public toString(): string {
    return `{ "namespace": "${this.namespace.name}", "podName": "${this.podName.name}", "cpuInMillicores": "${this.cpuInMillicores}m", "memoryInMebibytes": "${this.memoryInMebibytes}Mi"}`;
  }
}
