// SPDX-License-Identifier: Apache-2.0

import type * as x509 from '@peculiar/x509';
import type net from 'node:net';
import type * as WebSocket from 'ws';
import type crypto from 'node:crypto';
import {type ListrTask, type ListrTaskWrapper} from 'listr2';
import {type PublicKey} from '@hiero-ledger/sdk';
import {type AnyYargs, type ArgvStruct, type JsonString} from './aliases.js';
import {type Listr} from 'listr2';

// NOTE: DO NOT add any Solo imports in this file to avoid circular dependencies

export interface NodeKeyObject {
  privateKey: crypto.webcrypto.CryptoKey;
  certificate: x509.X509Certificate;
  certificateChain: x509.X509Certificates;
}

export interface PrivateKeyAndCertificateObject {
  privateKeyFile: string;
  certificateFile: string;
}

export interface ExtendedNetServer extends net.Server {
  localPort: number;
  info: string;
}

export interface LocalContextObject {
  reject: (reason?: any) => void;
  connection: WebSocket.WebSocket;
  errorMessage: string;
}

export interface AccountIdWithKeyPairObject {
  accountId: string;
  privateKey: string;
  publicKey: string;
}

/**
 * Generic type for representing optional types
 */
export type Optional<T> = T | undefined;

/**
 * Interface for capsuling validating for class's own properties
 */
export interface Validate {
  /**
   * Validates all properties of the class and throws if data is invalid
   */
  validate(): void;
}

/**
 * Interface for converting a class to a plain object.
 */
export interface ToObject<T> {
  /**
   * Converts the class instance to a plain object.
   *
   * @returns the plain object representation of the class.
   */
  toObject(): T;
}

/**
 * Interface for converting class to JSON string.
 */
export interface ToJSON {
  /**
   * Converts the class instance to a plain JSON string.
   *
   * @returns the plain JSON string of the class.
   */
  toJSON(): JsonString;
}

export type SoloListrTask<T> = ListrTask<T, any, any>;

export type SoloListrTaskWrapper<T> = ListrTaskWrapper<T, any, any>;

export type SoloListr<T> = Listr<T, any, any>;

export interface ServiceEndpoint {
  ipAddressV4?: string;
  port: number;
  domainName: string;
}

export interface NodeAccountId {
  accountId: {
    realm: string;
    shard: string;
    accountNum: string;
  };
}

export interface GenesisNetworkNodeStructure {
  nodeId: number;
  accountId: NodeAccountId;
  description: string;
  gossipEndpoint: ServiceEndpoint[];
  serviceEndpoint: ServiceEndpoint[];
  gossipCaCertificate: string;
  grpcCertificateHash: string;
  weight: number;
  deleted: boolean;
  adminKey: PublicKey;
}

export interface GenesisNetworkRosterStructure {
  nodeId: number;
  weight: number;
  gossipEndpoint: ServiceEndpoint[];
  gossipCaCertificate: string;
}

export interface GossipEndpoint {
  nodeId: number;
  hostname: string;
  port: number;
}

export interface portForwardConfig {
  localPort: number;
  podPort: number;
}

export interface CommandDefinition {
  command: string;
  desc: string;
  builder?: (yargs: AnyYargs) => any;
  handler?: (argv: ArgvStruct) => Promise<void>;
}

// GitHub API response interfaces
export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  content_type: string;
  size: number;
  digest: string;
}

export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: GitHubReleaseAsset[];
}

// GitLab API response interfaces
export interface GitLabReleaseSource {
  format: string;
  url: string;
}

export interface GitLabReleaseEvidence {
  sha: string;
  filepath: string;
  collected_at: string;
}

export interface GitLabReleaseAsset {
  count: number;
  sources: GitLabReleaseSource[];
  links: any[];
}

export interface GitLabRelease {
  name: string;
  tag_name: string;
  tag_path: string;
  description: string;
  assets: GitLabReleaseAsset;
  evidences: GitLabReleaseEvidence[];
}

export interface ReleaseInfo {
  downloadUrl: string;
  assetName: string;
  checksum: string;
  version: string;
}

export type InitDependenciesOptions = {deps: string[]; createCluster: boolean};

export type Version = string;
/// TODO - see if we can use NamespaceName and use some annotations and overrides to covert to strings
export type NamespaceNameAsString = string;
export type Context = string;
export type ComponentId = number;
export type DeploymentName = string;
export type Realm = number | Long;
export type Shard = number | Long;
export type ClusterReferenceName = string;
export type ClusterReferences = Map<ClusterReferenceName, Context>;
