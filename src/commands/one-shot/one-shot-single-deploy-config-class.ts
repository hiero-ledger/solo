// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type AnyObject, type ArgvStruct} from '../../types/aliases.js';

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

export interface OneShotVersionsObject {
  soloChart: string;
  consensus: string;
  mirror: string;
  explorer: string;
  relay: string;
  blockNode: string;
}

export interface OneShotSingleDeployConfigClass {
  relayNodeConfiguration: AnyObject;
  explorerNodeConfiguration: AnyObject;
  blockNodeConfiguration: AnyObject;
  mirrorNodeConfiguration: AnyObject;
  consensusNodeConfiguration: AnyObject;
  networkConfiguration: AnyObject;
  setupConfiguration: AnyObject;
  valuesFile: string;
  clusterRef: string;
  context: string;
  deployment: string;
  namespace: NamespaceName;
  numberOfConsensusNodes: number;
  cacheDir: string;
  predefinedAccounts: boolean;
  minimalSetup: boolean;
  deployMirrorNode: boolean;
  deployExplorer: boolean;
  deployRelay: boolean;
  deployMetricsServer: boolean;
  force: boolean;
  quiet: boolean;
  rollback: boolean;
  parallelDeploy: boolean;
  externalAddress: string;
  edgeEnabled: boolean;
  versions: OneShotVersionsObject;
  argv: ArgvStruct;
}
