// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../types/aliases.js';
import {type PodName} from '../integration/kube/resources/pod/pod-name.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type ClusterReferenceName, type Context, type DeploymentName} from './../types/index.js';

export class NetworkNodeServices {
  public constructor(
    public readonly clusterReference: ClusterReferenceName,
    public readonly context: Context,
    public readonly deployment: DeploymentName,
    public readonly nodeAlias: NodeAlias,
    public readonly namespace: NamespaceName,
    public readonly nodeId: number,
    public readonly nodePodName: PodName,
    public readonly haProxyName: string,
    public readonly haProxyLoadBalancerIp: string,
    public readonly haProxyClusterIp: string,
    public readonly haProxyGrpcPort: number,
    public readonly haProxyGrpcsPort: number,
    public readonly accountId: string,
    public readonly haProxyAppSelector: string,
    public readonly haProxyPodName: PodName,
    public readonly nodeServiceName: string,
    public readonly nodeServiceClusterIp: string,
    public readonly nodeServiceLoadBalancerIp: string,
    public readonly nodeServiceGossipPort: number,
    public readonly nodeServiceGrpcPort: number,
    public readonly nodeServiceGrpcsPort: number,
    public readonly envoyProxyName: string,
    public readonly envoyProxyClusterIp: string,
    public readonly envoyProxyLoadBalancerIp: string,
    public readonly envoyProxyGrpcWebPort: number,
    public readonly externalAddress: string,
  ) {}

  public key(): NodeAlias {
    return this.nodeAlias;
  }
}
