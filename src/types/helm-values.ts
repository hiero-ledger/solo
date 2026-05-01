// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeId} from './aliases.js';

export type EnvironmentVariable = {name: string; value: string};

export type PerNodeAdditionalValue = {
  name?: NodeAlias;
  nodeId?: NodeId;
  accountId?: string;
  blockNodesJson?: string;
};

export type PerNodeExtraEnvironmentOptions = {
  wrapsEnabled?: boolean;
  tss?: {wraps: {artifactsFolderName: string}};
  debugNodeAlias?: NodeAlias;
  useJavaMainClass?: boolean;
  additionalEnvironmentVariables?: Record<NodeAlias, EnvironmentVariable[]>;
  baseExtraEnvironmentVariables?: Record<NodeAlias, EnvironmentVariable[]>;
  additionalNodeValues?: Record<NodeAlias, PerNodeAdditionalValue>;
};

export type PerNodeExtraEnvironmentValues = {
  hedera: {
    nodes: Array<{
      root?: {extraEnv: EnvironmentVariable[]};
      name?: NodeAlias;
      nodeId?: NodeId;
      accountId?: string;
      blockNodesJson?: string;
    }>;
  };
};

export type PerNodeIdentity = {
  name?: NodeAlias;
  nodeId?: NodeId;
  accountId?: string;
};
