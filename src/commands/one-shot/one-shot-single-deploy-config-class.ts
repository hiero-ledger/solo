// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type AnyObject} from '../../types/aliases.js';

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
  force: boolean;
  quiet: boolean;
  rollback: boolean;
  // ── EVM profile ────────────────────────────────────────────────────────────
  // evm: true activates the EVM developer profile (20 pre-funded ECDSA alias accounts,
  //   mirror-node explorer on by default, JSON-RPC relay included).
  evm: boolean;
  // noExplorer: true disables the explorer in EVM mode, overriding the default.
  noExplorer: boolean;
  // explorerType selects which explorer to deploy: 'mirror-node' (default) or 'blockscout'.
  explorerType: string;
}
