// SPDX-License-Identifier: Apache-2.0

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
  devMode: boolean;
  forcePortForward: boolean;
  outputPath: string;
}
