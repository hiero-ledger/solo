// SPDX-License-Identifier: Apache-2.0

/**
 * Host resources reported by the local container engine (Docker or Podman).
 */
export interface ContainerEngineResources {
  /** Total memory available to the engine, in bytes. */
  memoryBytes: number;

  /** Number of CPU cores available to the engine. */
  cpuCount: number;
}
