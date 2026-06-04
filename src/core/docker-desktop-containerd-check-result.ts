// SPDX-License-Identifier: Apache-2.0

/**
 * Result returned by {@link checkDockerDesktopContainerdSetting}.
 */
export interface DockerDesktopContainerdCheckResult {
  /** Whether the "Use containerd for pulling and storing images" setting is enabled. */
  readonly containerdSnapshotterEnabled: boolean;
  /** Path of the settings file that was read, or undefined if none was found. */
  readonly settingsFilePath?: string;
  /** Human-readable warning message when containerdSnapshotterEnabled is true. */
  readonly warningMessage?: string;
}
