// SPDX-License-Identifier: Apache-2.0

import {type ServiceEndpoint} from './service-endpoint.js';

export interface GenesisNetworkRosterStructure {
  nodeId: number;
  weight: number;
  gossipEndpoint: ServiceEndpoint[];
  gossipCaCertificate: string;
}
