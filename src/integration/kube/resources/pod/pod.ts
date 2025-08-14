// SPDX-License-Identifier: Apache-2.0

import {type ExtendedNetServer} from '../../../../types/index.js';
import {type PodReference} from './pod-reference.js';
import {type ContainerName} from '../container/container-name.js';
import {type PodCondition} from './pod-condition.js';

export interface Pod {
  /**
   * The pod reference
   */
  readonly podReference: PodReference;

  /**
   * The labels of the pod
   */
  readonly labels?: Record<string, string>;

  /**
   * The command to run for the startup probe
   */
  readonly startupProbeCommand?: string[];

  /**
   * The container name
   */
  readonly containerName?: ContainerName;

  /**
   * The container image
   */
  readonly containerImage?: string;

  /**
   * The container command
   */
  readonly containerCommand?: string[];

  /**
   * The conditions of the pod
   */
  readonly conditions?: PodCondition[];

  /**
   * The pod IP
   */
  readonly podIp?: string;

  /**
   * The deletion timestamp of the pod
   */
  readonly deletionTimestamp?: Date;

  /**
   * Get a pod by name and namespace, will check every 1 second until the pod is no longer found.
   * Can throw a SoloError if there is an error while deleting the pod.
   */
  killPod(): Promise<void>;

  /**
   * Port forward a port from a pod to localhost
   *
   * This simple server just forwards traffic from itself to a service running in kubernetes
   * -> localhost:localPort -> port-forward-tunnel -> kubernetes-pod:targetPort
   * @param localPort - the local port to forward to
   * @param podPort - the port on the pod to forward from
   * @param detach - if true, the port forward will run in the background and return the port number
   * @param reuse - if true, reuse the port number from previous port forward operation
   * @returns Promise resolving to the port forwarder server when not detached,
   *          or the port number (which may differ from localPort if it was in use) when detached
   */
  portForward(localPort: number, podPort: number, detach: true, reuse?: boolean): Promise<number>;
  portForward(localPort: number, podPort: number, detach?: false, reuse?: boolean): Promise<ExtendedNetServer>;

  /**
   * Stop the port forward
   * @param server - an instance of server returned by portForward method
   * @param [maxAttempts] - the maximum number of attempts to check if the server is stopped
   * @param [timeout] - the delay between checks in milliseconds
   */
  stopPortForward(server: ExtendedNetServer, maxAttempts?: number, timeout?: number): Promise<void>;
}
