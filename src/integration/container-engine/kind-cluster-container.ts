// SPDX-License-Identifier: Apache-2.0

import {type ContainerEngineCommand} from './container-engine-command.js';

/**
 * A container-engine container that belongs to a Kind cluster (carries the
 * `io.x-k8s.kind.cluster` label), such as a control-plane node container.
 */
export interface KindClusterContainer {
  /** The container name, for example 'solo-cluster-control-plane'. */
  containerName: string;
  /** The Kind cluster name read from the `io.x-k8s.kind.cluster` label. */
  clusterName: string;
  /** True when the container is currently running. */
  running: boolean;
  /** The engine command that sees this container, used to start or stop it. */
  engineCommand: ContainerEngineCommand;
}
