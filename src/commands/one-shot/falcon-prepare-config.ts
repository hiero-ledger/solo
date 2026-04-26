// SPDX-License-Identifier: Apache-2.0

/**
 * User-supplied answers collected by the falcon prepare wizard that drive
 * the generated falcon-values.yaml file.
 *
 * Note: `enableDevChartMode` maps to the helm-chart `--dev` flag used by
 * `setup` and `blockNode` sections (enables local-build / debug paths).
 * It is intentionally **not** the same as `Flags.devMode`, which is a
 * logger verbosity toggle — see `SoloPinoLogger.setDevMode`.
 */
export interface FalconPrepareConfig {
  numberOfConsensusNodes: number;
  releaseTag: string;
  mirrorNodeVersion: string;
  relayRelease: string;
  blockNodeChartVersion: string;
  explorerVersion: string;
  soloChartVersion: string;
  loadBalancer: boolean;
  enableMirrorIngress: boolean;
  localBuildPath: string;
  debugNodeAlias: string;
  enableDevChartMode: boolean;
  forcePortForward: boolean;
  outputPath: string;
}
