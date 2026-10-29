// SPDX-License-Identifier: Apache-2.0

import {type AccountId, type PublicKey} from '@hiero-ledger/sdk';
import {type GenesisNetworkNodeStructure, type ServiceEndpoint, type ToObject} from '../../types/index.js';
import {GenesisNetworkDataWrapper} from './genesis-network-data-wrapper.js';
import {Address} from '../../business/address/address.js';

export class GenesisNetworkNodeDataWrapper
  extends GenesisNetworkDataWrapper
  implements ToObject<GenesisNetworkNodeStructure>
{
  public accountId: AccountId;
  public serviceEndpoint: ServiceEndpoint[] = [];
  public grpcCertificateHash: string;
  public readonly deleted: boolean = false;

  public constructor(
    public override readonly nodeId: number,
    public readonly adminKey: PublicKey,
    public readonly description: string,
  ) {
    super(nodeId);
  }

  /**
   * @param fqdnOrIpAddress - a fully qualified domain name or an IPv4 address
   * @param port
   */
  public addServiceEndpoint(fqdnOrIpAddress: string, port: number): void {
    const address: Address = new Address(port, fqdnOrIpAddress);
    this.serviceEndpoint.push({
      domainName: address.domainName,
      port,
      ipAddressV4: address.ipAddressV4Base64,
    });
  }

  public toObject(): GenesisNetworkNodeStructure {
    return {
      nodeId: this.nodeId,
      accountId: {
        shardNum: `${this.accountId.shard}`,
        realmNum: `${this.accountId.realm}`,
        accountNum: `${this.accountId.num}`,
      },
      description: this.description,
      gossipEndpoint: this.gossipEndpoint,
      serviceEndpoint: this.serviceEndpoint,
      gossipCaCertificate: this.gossipCaCertificate,
      grpcCertificateHash: this.grpcCertificateHash,
      weight: this.weight,
      deleted: this.deleted,
      adminKey: {ed25519: Buffer.from(this.adminKey.toBytesRaw()).toString('base64')},
    };
  }
}
