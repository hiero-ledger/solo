// SPDX-License-Identifier: Apache-2.0

import * as x509 from '@peculiar/x509';
import os from 'node:os';
import {DataValidationError} from './errors/data-validation-error.js';
import {IllegalArgumentError} from './errors/illegal-argument-error.js';
import {MissingArgumentError} from './errors/missing-argument-error.js';
import {SoloError} from './errors/solo-error.js';
import * as constants from './constants.js';
import {type AccountId} from '@hiero-ledger/sdk';
import {type IP, type NodeAlias, type NodeAliases, type NodeId} from '../types/aliases.js';
import {PodName} from '../integration/kube/resources/pod/pod-name.js';
import {GrpcProxyTlsEnums} from './enumerations.js';
import {HEDERA_PLATFORM_VERSION} from '../../version.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type ClusterReferenceName, type ComponentId, type NamespaceNameAsString} from './../types/index.js';
import {PathEx} from '../business/utils/path-ex.js';
import {type ConsensusNode} from './model/consensus-node.js';

export class Templates {
  public static renderNetworkPodName(nodeAlias: NodeAlias): PodName {
    return PodName.of(`network-${nodeAlias}-0`);
  }

  private static renderNetworkSvcName(nodeAlias: NodeAlias): string {
    return `network-${nodeAlias}-svc`;
  }

  public static renderNetworkHeadlessSvcName(nodeAlias: NodeAlias): string {
    return `network-${nodeAlias}`;
  }

  public static renderNodeAliasFromNumber(number_: number): NodeAlias {
    return `node${number_}`;
  }

  public static renderNodeAliasesFromCount(count: number, existingNodesCount: number): NodeAliases {
    const nodeAliases: NodeAliases = [];
    let nodeNumber: number = existingNodesCount + 1;

    for (let index: number = 1; index <= count; index++) {
      nodeAliases.push(Templates.renderNodeAliasFromNumber(nodeNumber));
      nodeNumber++;
    }

    return nodeAliases;
  }

  public static renderGossipPemPrivateKeyFile(nodeAlias: NodeAlias): string {
    return `${constants.SIGNING_KEY_PREFIX}-private-${nodeAlias}.pem`;
  }

  public static renderGossipPemPublicKeyFile(nodeAlias: NodeAlias): string {
    return `${constants.SIGNING_KEY_PREFIX}-public-${nodeAlias}.pem`;
  }

  public static renderTLSPemPrivateKeyFile(nodeAlias: NodeAlias): string {
    return `hedera-${nodeAlias}.key`;
  }

  public static renderTLSPemPublicKeyFile(nodeAlias: NodeAlias): string {
    return `hedera-${nodeAlias}.crt`;
  }

  public static renderNodeAdminKeyName(nodeAlias: NodeAlias): string {
    return `${nodeAlias}-admin`;
  }

  public static renderNodeFriendlyName(prefix: string, nodeAlias: NodeAlias, suffix = ''): string {
    const parts = [prefix, nodeAlias];
    if (suffix) {
      parts.push(suffix);
    }
    return parts.join('-');
  }

  public static extractNodeAliasFromPodName(podName: PodName): NodeAlias {
    const parts = podName.name.split('-');
    if (parts.length !== 3) {
      throw new DataValidationError(`pod name is malformed : ${podName.name}`, 3, parts.length);
    }
    return parts[1].trim() as NodeAlias;
  }

  static prepareReleasePrefix(tag: string): string {
    if (!tag) {
      throw new MissingArgumentError('tag cannot be empty');
    }

    const parsed = tag.split('.');
    if (parsed.length < 3) {
      throw new Error(`tag (${tag}) must include major, minor and patch fields (e.g. v0.40.4)`);
    }
    return `${parsed[0]}.${parsed[1]}`;
  }

  /**
   * renders the name to be used to store the new account key as a Kubernetes secret
   * @param accountId
   * @returns the name of the Kubernetes secret to store the account key
   */
  public static renderAccountKeySecretName(accountId: AccountId | string): string {
    return `account-key-${accountId.toString()}`;
  }

  /**
   * renders the label selector to be used to fetch the new account key from the Kubernetes secret
   * @param accountId
   * @returns the label selector of the Kubernetes secret to retrieve the account key   */
  public static renderAccountKeySecretLabelSelector(accountId: AccountId | string): string {
    return `solo.hedera.com/account-id=${accountId.toString()}`;
  }

  /**
   * renders the label object to be used to store the new account key in the Kubernetes secret
   * @param accountId
   * @returns the label object to be used to store the new account key in the Kubernetes secret
   */
  public static renderAccountKeySecretLabelObject(accountId: AccountId | string): {
    'solo.hedera.com/account-id': string;
  } {
    return {
      'solo.hedera.com/account-id': accountId.toString(),
    };
  }

  static renderDistinguishedName(
    nodeAlias: NodeAlias,
    state = 'TX',
    locality = 'Richardson',
    org = 'Hedera',
    orgUnit = 'Hedera',
    country = 'US',
  ) {
    return new x509.Name(`CN=${nodeAlias},ST=${state},L=${locality},O=${org},OU=${orgUnit},C=${country}`);
  }

  public static renderStagingDir(cacheDirectory: string, releaseTagOverride: string): string {
    let releaseTag = releaseTagOverride;
    if (!cacheDirectory) {
      throw new IllegalArgumentError('cacheDirectory cannot be empty');
    }

    if (!releaseTag) {
      releaseTag = HEDERA_PLATFORM_VERSION;
    }

    const releasePrefix = this.prepareReleasePrefix(releaseTag);
    if (!releasePrefix) {
      throw new IllegalArgumentError('releasePrefix cannot be empty');
    }

    return PathEx.resolve(PathEx.join(cacheDirectory, releasePrefix, 'staging', releaseTag));
  }

  public static installationPath(
    dep: string,
    osPlatform: NodeJS.Platform | string = os.platform(),
    installationDirectory: string = PathEx.join(constants.SOLO_HOME_DIR, 'bin'),
  ): string {
    switch (dep) {
      case constants.HELM:
      case constants.KIND:
      case constants.PODMAN:
      case constants.VFKIT:
      case constants.GVPROXY:
      case constants.KUBECTL: {
        if (osPlatform === constants.OS_WINDOWS) {
          return PathEx.join(installationDirectory, `${dep}.exe`);
        }

        return PathEx.join(installationDirectory, dep);
      }

      default: {
        throw new SoloError(`unknown dep: ${dep}`);
      }
    }
  }

  public static renderFullyQualifiedNetworkPodName(namespace: NamespaceName, nodeAlias: NodeAlias): string {
    return `${Templates.renderNetworkPodName(nodeAlias)}.${Templates.renderNetworkHeadlessSvcName(nodeAlias)}.${namespace.name}.svc.cluster.local`;
  }

  public static renderFullyQualifiedNetworkSvcName(namespace: NamespaceName, nodeAlias: NodeAlias): string {
    return `${Templates.renderNetworkSvcName(nodeAlias)}.${namespace.name}.svc.cluster.local`;
  }

  public static nodeIdFromNodeAlias(nodeAlias: NodeAlias): NodeId {
    for (let index: number = nodeAlias.length - 1; index > 0; index--) {
      if (Number.isNaN(Number.parseInt(nodeAlias[index]))) {
        return Number.parseInt(nodeAlias.slice(index + 1)) - 1;
      }
    }

    throw new SoloError(`Can't get node id from node ${nodeAlias}`);
  }

  public static renderComponentIdFromNodeId(nodeId: NodeId): ComponentId {
    return nodeId + 1;
  }

  public static renderComponentIdFromNodeAlias(nodeAlias: NodeAlias): ComponentId {
    return this.nodeIdFromNodeAlias(nodeAlias) + 1;
  }

  public static renderNodeIdFromComponentId(componentId: ComponentId): NodeId {
    return componentId - 1;
  }

  public static renderGossipKeySecretName(nodeAlias: NodeAlias): string {
    return `network-${nodeAlias}-keys-secrets`;
  }

  public static renderGossipKeySecretLabelObject(nodeAlias: NodeAlias): {'solo.hedera.com/node-name': string} {
    return {'solo.hedera.com/node-name': nodeAlias};
  }

  /**
   * Creates the secret name based on the node alias type
   *
   * @param nodeAlias - node alias
   * @param type - whether is for gRPC or gRPC Web ( Haproxy or Envoy )
   *
   * @returns the appropriate secret name
   */
  static renderGrpcTlsCertificatesSecretName(nodeAlias: NodeAlias, type: GrpcProxyTlsEnums) {
    switch (type) {
      //? HAProxy Proxy
      case GrpcProxyTlsEnums.GRPC: {
        return `haproxy-proxy-secret-${nodeAlias}`;
      }

      //? Envoy Proxy
      case GrpcProxyTlsEnums.GRPC_WEB: {
        return `envoy-proxy-secret-${nodeAlias}`;
      }
    }
  }

  /**
   * Creates the secret labels based on the node alias type
   *
   * @param nodeAlias - node alias
   * @param type - whether is for gRPC or gRPC Web ( Haproxy or Envoy )
   *
   * @returns the appropriate secret labels
   */
  static renderGrpcTlsCertificatesSecretLabelObject(nodeAlias: NodeAlias, type: GrpcProxyTlsEnums) {
    switch (type) {
      //? HAProxy Proxy
      case GrpcProxyTlsEnums.GRPC: {
        return {'haproxy-proxy-secret': nodeAlias};
      }

      //? Envoy Proxy
      case GrpcProxyTlsEnums.GRPC_WEB: {
        return {'envoy-proxy-secret': nodeAlias};
      }
    }
  }

  public static parseNodeAliasToIpMapping(unparsed: string): Record<NodeAlias, IP> {
    const mapping: Record<NodeAlias, IP> = {};

    for (const data of unparsed.split(',')) {
      const [nodeAlias, ip] = data.split('=') as [NodeAlias, IP];
      mapping[nodeAlias] = ip;
    }

    return mapping;
  }

  public static parseNodeAliasToDomainNameMapping(unparsed: string): Record<NodeAlias, string> {
    const mapping: Record<NodeAlias, string> = {};

    for (const data of unparsed.split(',')) {
      const [nodeAlias, domainName] = data.split('=') as [NodeAlias, string];

      if (!nodeAlias || typeof nodeAlias !== 'string') {
        throw new SoloError(`Can't parse node alias: ${data}`);
      }
      if (!domainName || typeof domainName !== 'string') {
        throw new SoloError(`Can't parse domain name: ${data}`);
      }

      mapping[nodeAlias] = domainName;
    }

    return mapping;
  }

  /**
   * Renders the fully qualified domain name for a consensus node. We support the following variables for templating
   * in the dnsConsensusNodePattern: {nodeAlias}, {nodeId}, {namespace}, {cluster}
   *
   * The end result will be `${dnsConsensusNodePattern}.${dnsBaseDomain}`.
   * For example, if the dnsConsensusNodePattern is `network-{nodeAlias}-svc.{namespace}.svc` and the dnsBaseDomain is `cluster.local`,
   * the fully qualified domain name will be `network-{nodeAlias}-svc.{namespace}.svc.cluster.local`.
   * @param nodeAlias - the alias of the consensus node
   * @param nodeId - the id of the consensus node
   * @param namespace - the namespace of the consensus node
   * @param cluster - the cluster of the consensus node
   * @param dnsBaseDomain - the base domain of the cluster
   * @param dnsConsensusNodePattern - the pattern to use for the consensus node
   */
  static renderConsensusNodeFullyQualifiedDomainName(
    nodeAlias: string,
    nodeId: number,
    namespace: NamespaceNameAsString,
    cluster: ClusterReferenceName,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ) {
    const searchReplace = {
      '{nodeAlias}': nodeAlias,
      '{nodeId}': nodeId.toString(),
      '{namespace}': namespace,
      '{cluster}': cluster,
    };

    for (const [search, replace] of Object.entries(searchReplace)) {
      dnsConsensusNodePattern = dnsConsensusNodePattern.replace(search, replace);
    }

    return `${dnsConsensusNodePattern}.${dnsBaseDomain}`;
  }

  /**
   * @param serviceName - name of the service
   * @param namespace - the pattern to use for the consensus node
   * @param dnsBaseDomain - the base domain of the cluster
   */
  public static renderSvcFullyQualifiedDomainName(
    serviceName: string,
    namespace: NamespaceNameAsString,
    dnsBaseDomain: string,
  ): string {
    return `${serviceName}.${namespace}.svc.${dnsBaseDomain}`;
  }

  // Component Label Selectors

  public static renderRelayLabels(id: ComponentId, legacyReleaseName?: string): string[] {
    return legacyReleaseName
      ? [`app.kubernetes.io/instance=${legacyReleaseName}`, 'app.kubernetes.io/name=relay']
      : [`app.kubernetes.io/instance=${constants.JSON_RPC_RELAY_RELEASE_NAME}-${id}`, 'app.kubernetes.io/name=relay'];
  }

  public static renderHaProxyLabels(id: ComponentId): string[] {
    const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(id);
    return [`app=haproxy-${nodeAlias}`, 'solo.hedera.com/type=haproxy'];
  }

  public static renderMirrorNodeLabels(id: ComponentId, legacyReleaseName?: string): string[] {
    const releaseName: string = legacyReleaseName ?? Templates.renderMirrorNodeName(id);

    return [
      'app.kubernetes.io/name=importer',
      'app.kubernetes.io/component=importer',
      `app.kubernetes.io/instance=${releaseName}`,
    ];
  }

  public static renderEnvoyProxyLabels(id: ComponentId): string[] {
    const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(id);
    return [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=envoy-proxy'];
  }

  public static renderExplorerLabels(id: ComponentId, legacyReleaseName?: string): string[] {
    const releaseName: string = legacyReleaseName ?? `${constants.EXPLORER_RELEASE_NAME}-${id}`;

    return [`app.kubernetes.io/instance=${releaseName}`];
  }

  public static renderConsensusNodeLabels(id: ComponentId): string[] {
    return [`app=network-${Templates.renderNodeAliasFromNumber(id)}`];
  }

  public static renderBlockNodeLabels(id: ComponentId, legacyReleaseName?: string): string[] {
    const releaseName: string = legacyReleaseName ?? Templates.renderBlockNodeName(id);

    return [`app.kubernetes.io/name=${releaseName}`];
  }

  public static renderExplorerName(id: ComponentId): string {
    return `${constants.EXPLORER_RELEASE_NAME}-${id}`;
  }

  public static renderRelayName(id: ComponentId): string {
    return `${constants.JSON_RPC_RELAY_RELEASE_NAME}-${id}`;
  }

  public static renderBlockNodeName(id: ComponentId): string {
    return `${constants.BLOCK_NODE_RELEASE_NAME}-${id}`;
  }

  public static renderMirrorNodeName(id: ComponentId): string {
    return `${constants.MIRROR_NODE_RELEASE_NAME}-${id}`;
  }

  public static renderConfigMapRemoteConfigLabels(): string[] {
    return ['solo.hedera.com/type=remote-config'];
  }

  public static renderNodeLabelsFromNodeAlias(nodeAlias: NodeAlias): string[] {
    return [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'];
  }

  public static parseBlockNodePriorityMapping(rawString: string, nodes: ConsensusNode[]): Record<NodeAlias, number> {
    const mapping: Record<NodeAlias, number> = {};

    const isDefault: boolean = !rawString || rawString.split(',').length === 0;

    const nodeAliasesToPriorityMapping: string[] = isDefault
      ? nodes.map((node): NodeAlias => node.name)
      : rawString.split(',');

    for (const data of nodeAliasesToPriorityMapping) {
      // eslint-disable-next-line prefer-const
      let [nodeAlias, priority] = data.split('=') as [NodeAlias, number | undefined];

      priority = !priority && nodeAliasesToPriorityMapping.length === 1 ? 2 : 1;

      mapping[nodeAlias] = +priority || 1;
    }

    return mapping;
  }
}
