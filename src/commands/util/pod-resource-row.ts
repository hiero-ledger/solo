// SPDX-License-Identifier: Apache-2.0

import {type PodReference} from '../../integration/kube/resources/pod/pod-reference.js';

/**
 * One line of the resource snapshot: a pod's current usage joined with the restart and
 * container-state evidence that explains why it may be consuming CPU.
 */
export interface PodResourceRow {
  readonly context: string;
  readonly podReference: PodReference;
  readonly namespace: string;
  readonly podName: string;
  readonly phase: string;
  /** CPU usage in millicores, or undefined when the metrics API is unavailable. */
  readonly cpuInMillicores?: number;
  /** Memory usage in mebibytes, or undefined when the metrics API is unavailable. */
  readonly memoryInMebibytes?: number;
  readonly restartCount: number;
  /** Waiting/terminated reasons per container, e.g. `root-container: OOMKilled (exit 137)`. */
  readonly stateNotes: string[];
}
