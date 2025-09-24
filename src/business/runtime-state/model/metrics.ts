// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type PodName} from '../../../integration/kube/resources/pod/pod-name.js';

export class Metrics {
  public constructor(
    public readonly namespace: NamespaceName,
    public readonly podName: PodName,
    public readonly cpuInCores: number,
    public readonly memoryInBytes: number,
  ) {}
}
