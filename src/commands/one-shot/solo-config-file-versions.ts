// SPDX-License-Identifier: Apache-2.0

/**
 * The shape of component version keys read from a {@code solo.config.yaml} or
 * {@code solo.config.json} file (both camelCase and kebab-case keys are normalized to this form).
 *
 * Supported YAML example:
 * ```yaml
 * consensusNodeVersion: v0.73.0
 * mirror-node-version: v0.153.1
 * relayVersion: 0.76.2
 * explorer-version: 26.0.0
 * blockNodeVersion: 0.31.0
 * ```
 *
 * Supported JSON example:
 * ```json
 * {
 *   "consensusNodeVersion": "v0.73.0",
 *   "mirrorNodeVersion": "v0.153.1",
 *   "relayVersion": "0.76.2",
 *   "explorerVersion": "26.0.0",
 *   "blockNodeVersion": "0.31.0"
 * }
 * ```
 */
export interface SoloConfigFileVersions {
  consensusNodeVersion?: string;
  mirrorNodeVersion?: string;
  relayVersion?: string;
  explorerVersion?: string;
  blockNodeVersion?: string;
}
