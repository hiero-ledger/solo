// SPDX-License-Identifier: Apache-2.0

import {type NodeId} from '../../types/aliases.js';
import {type ServiceEndpoint} from '../../types/index.js';
import {Address} from '../../business/address/address.js';

export abstract class GenesisNetworkDataWrapper {
  public gossipEndpoint: ServiceEndpoint[] = [];
  public weight: number;
  public gossipCaCertificate: string;

  protected constructor(public readonly nodeId: NodeId) {}

  /**
   * @param fqdnOrIpAddress - a fully qualified domain name or IP v4 address
   * @param port
   */
  public addGossipEndpoint(fqdnOrIpAddress: string, port: number): void {
    const address: Address = new Address(port, fqdnOrIpAddress);
    this.gossipEndpoint.push({
      domainName: address.domainName,
      port,
      ipAddressV4: address.ipAddressV4Base64,
    });
  }
}
