// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type ClusterReferenceName, type Context, type DeploymentName} from './../types/index.js';
import {type PodName} from '../integration/kube/resources/pod/pod-name.js';
import {type NodeAlias, type NodeId} from '../types/aliases.js';
import {NetworkNodeServices} from './network-node-services.js';

export class NetworkNodeServicesBuilder {
  public namespace: NamespaceName;
  public clusterRef: ClusterReferenceName;
  public context: Context;
  public deployment: DeploymentName;
  public nodeId: NodeId;
  public haProxyName: string;
  public accountId: string;
  public haProxyClusterIp!: string;
  public envoyProxyGrpcWebPort!: number;
  public envoyProxyLoadBalancerIp: string;
  public haProxyLoadBalancerIp: string;
  public haProxyGrpcPort!: number;
  public haProxyGrpcsPort!: number;
  public haProxyAppSelector!: string;
  public haProxyPodName!: PodName;
  public nodeServiceName!: string;
  public nodeServiceClusterIp!: string;
  public nodeServiceGrpcsPort!: number;
  public envoyProxyClusterIp: string;
  public envoyProxyName!: string;
  public nodeServiceLoadBalancerIp!: string;
  public nodeServiceGossipPort!: number;
  public nodeServiceGrpcPort!: number;
  public externalAddress!: string;
  public nodePodName: PodName;

  public constructor(public readonly nodeAlias: NodeAlias) {}

  public withNamespace(namespace: NamespaceName): this {
    this.namespace = namespace;
    return this;
  }

  public withClusterRef(clusterReference: ClusterReferenceName): this {
    this.clusterRef = clusterReference;
    return this;
  }

  public withContext(context: Context): this {
    this.context = context;
    return this;
  }

  public withDeployment(deployment: DeploymentName): this {
    this.deployment = deployment;
    return this;
  }

  public withNodeId(nodeId: NodeId): this {
    this.nodeId = nodeId;
    return this;
  }

  public withAccountId(accountId: string): this {
    this.accountId = accountId;
    return this;
  }

  public withHaProxyName(haProxyName: string): this {
    this.haProxyName = haProxyName;
    return this;
  }

  public withHaProxyClusterIp(haProxyClusterIp: string): this {
    this.haProxyClusterIp = haProxyClusterIp;
    return this;
  }

  public withHaProxyLoadBalancerIp(haProxyLoadBalancerIp: string | undefined): this {
    this.haProxyLoadBalancerIp = haProxyLoadBalancerIp;
    return this;
  }

  public withHaProxyGrpcPort(haProxyGrpcPort: number): this {
    this.haProxyGrpcPort = +haProxyGrpcPort;
    return this;
  }

  public withHaProxyGrpcsPort(haProxyGrpcsPort: number): this {
    this.haProxyGrpcsPort = +haProxyGrpcsPort;
    return this;
  }

  public withHaProxyAppSelector(haProxyAppSelector: string): this {
    this.haProxyAppSelector = haProxyAppSelector;
    return this;
  }

  public withHaProxyPodName(haProxyPodName: PodName): this {
    this.haProxyPodName = haProxyPodName;
    return this;
  }

  public withNodePodName(nodePodName: PodName): this {
    this.nodePodName = nodePodName;
    return this;
  }

  public withNodeServiceName(nodeServiceName: string): this {
    this.nodeServiceName = nodeServiceName;
    return this;
  }

  public withNodeServiceClusterIp(nodeServiceClusterIp: string): this {
    this.nodeServiceClusterIp = nodeServiceClusterIp;
    return this;
  }

  public withNodeServiceLoadBalancerIp(nodeServiceLoadBalancerIp: string): this {
    this.nodeServiceLoadBalancerIp = nodeServiceLoadBalancerIp;
    return this;
  }

  public withNodeServiceGossipPort(nodeServiceGossipPort: number): this {
    this.nodeServiceGossipPort = +nodeServiceGossipPort;
    return this;
  }

  public withNodeServiceGrpcPort(nodeServiceGrpcPort: number): this {
    this.nodeServiceGrpcPort = +nodeServiceGrpcPort;
    return this;
  }

  public withNodeServiceGrpcsPort(nodeServiceGrpcsPort: number): this {
    this.nodeServiceGrpcsPort = +nodeServiceGrpcsPort;
    return this;
  }

  public withEnvoyProxyName(envoyProxyName: string): this {
    this.envoyProxyName = envoyProxyName;
    return this;
  }

  public withEnvoyProxyClusterIp(envoyProxyClusterIp: string | undefined): this {
    this.envoyProxyClusterIp = envoyProxyClusterIp;
    return this;
  }

  public withEnvoyProxyLoadBalancerIp(envoyProxyLoadBalancerIp?: string): this {
    this.envoyProxyLoadBalancerIp = envoyProxyLoadBalancerIp;
    return this;
  }

  public withEnvoyProxyGrpcWebPort(envoyProxyGrpcWebPort: number): this {
    this.envoyProxyGrpcWebPort = +envoyProxyGrpcWebPort;
    return this;
  }

  public withExternalAddress(externalAddress: string): this {
    this.externalAddress = externalAddress;
    return this;
  }

  public build(): NetworkNodeServices {
    return new NetworkNodeServices(
      this.clusterRef,
      this.context,
      this.deployment,
      this.nodeAlias,
      this.namespace,
      this.nodeId,
      this.nodePodName,
      this.haProxyName,
      this.haProxyLoadBalancerIp,
      this.haProxyClusterIp,
      this.haProxyGrpcPort,
      this.haProxyGrpcsPort,
      this.accountId,
      this.haProxyAppSelector,
      this.haProxyPodName,
      this.nodeServiceName,
      this.nodeServiceClusterIp,
      this.nodeServiceLoadBalancerIp,
      this.nodeServiceGossipPort,
      this.nodeServiceGrpcPort,
      this.nodeServiceGrpcsPort,
      this.envoyProxyName,
      this.envoyProxyClusterIp,
      this.envoyProxyLoadBalancerIp,
      this.envoyProxyGrpcWebPort,
      this.externalAddress,
    );
  }

  public key(): NodeAlias {
    return this.nodeAlias;
  }
}
