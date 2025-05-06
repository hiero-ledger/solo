// SPDX-License-Identifier: Apache-2.0

export type Version = string;
/// TODO - see if we can use NamespaceName and use some annotations and overrides to covert to strings
export type NamespaceNameAsString = string;
export type DeploymentName = string;
export type Context = string;
export type ComponentName = string;
export type Realm = number | Long;
export type Shard = number | Long;

export type ClusterReference = string;
export type ClusterReferences = Map<string, string>;
