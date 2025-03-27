// SPDX-License-Identifier: Apache-2.0

import {type NodeId} from '../../types/aliases.js';
import {type ServiceEndpoint} from '../../types/index.js';
import {isIPv4Address} from '../helpers.js';

export abstract class GenesisNetworkDataWrapper {
  public gossipEndpoint: ServiceEndpoint[] = [];
  public weight: number;
  public gossipCaCertificate: string;

  protected constructor(public readonly nodeId: NodeId) {}

  /**
   * @param address - a fully qualified domain name
   * @param port
   */
  public addGossipEndpoint(address: string, port: number): void {
    const isIpV4Address: boolean = isIPv4Address(address);
    this.gossipEndpoint.push({
      domainName: isIpV4Address ? '' : address,
      port,
      ipAddressV4: isIpV4Address ? address : '',
    });
  }
}
