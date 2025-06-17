// SPDX-License-Identifier: Apache-2.0

import {type AccountId, type PublicKey} from '@hashgraph/sdk';
import {type GenesisNetworkNodeStructure, type ServiceEndpoint, type ToObject} from '../../types/index.js';
import {GenesisNetworkDataWrapper} from './genesis-network-data-wrapper.js';
import {ipv4ToBase64, isIPv4Address} from '../helpers.js';

export class GenesisNetworkNodeDataWrapper
  extends GenesisNetworkDataWrapper
  implements ToObject<GenesisNetworkNodeStructure>
{
  public accountId: AccountId;
  public serviceEndpoint: ServiceEndpoint[] = [];
  public grpcCertificateHash: string;
  public readonly deleted: boolean = false;
  public grpcProxyEndpoint: ServiceEndpoint[] = [];

  public constructor(
    public override readonly nodeId: number,
    public readonly adminKey: PublicKey,
    public readonly description: string,
  ) {
    super(nodeId);
  }

  /**
   * @param address - a fully qualified domain name or an IPv4 address
   * @param port
   */
  public addServiceEndpoint(address: string, port: number): void {
    const isIpV4Address: boolean = isIPv4Address(address);
    this.serviceEndpoint.push({
      domainName: isIpV4Address ? '' : address,
      port,
      ipAddressV4: isIpV4Address ? ipv4ToBase64(address) : undefined,
    });
  }

  /**
   * @param address - a fully qualified domain name or an IPv4 address
   * @param port
   */
  public addGrpcProxyEndpoint(address: string, port: number): void {
    const isIpV4Address: boolean = isIPv4Address(address);
    this.grpcProxyEndpoint.push({
      domainName: isIpV4Address ? '' : address,
      port,
      ipAddressV4: isIpV4Address ? ipv4ToBase64(address) : undefined,
    });
  }

  public toObject(): GenesisNetworkNodeStructure {
    return {
      nodeId: this.nodeId,
      accountId: {
        realmNum: `${this.accountId.realm}`,
        shardNum: `${this.accountId.shard}`,
        accountNum: `${this.accountId.num}`,
      },
      description: this.description,
      gossipEndpoint: this.gossipEndpoint,
      serviceEndpoint: this.serviceEndpoint,
      gossipCaCertificate: this.gossipCaCertificate,
      grpcCertificateHash: this.grpcCertificateHash,
      grpcProxyEndpoint: this.grpcProxyEndpoint,
      weight: this.weight,
      deleted: this.deleted,
      adminKey: this.adminKey,
    };
  }
}
//
