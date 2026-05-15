// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type AnyObject} from '../../types/aliases.js';

/**
 * The shape of component version keys read from a {@code solo.config.yaml} or
 * {@code solo.config.json} file (both camelCase and kebab-case keys are normalised to this form).
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
}
