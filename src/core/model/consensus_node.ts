// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../types/aliases.js';
import {type ClusterRef} from '../config/remote/types.js';

export class ConsensusNode {
  constructor(
    public readonly name: NodeAlias,
    public readonly nodeId: number,
    public readonly namespace: string,
    public readonly cluster: ClusterRef,
    public readonly context: string,
    public readonly dnsBaseDomain: string,
    public readonly dnsConsensusNodePattern: string,
    public readonly fullyQualifiedDomainName: string,
  ) {
    if (!context) {
      throw new Error(`ConsensusNode context cannot be empty or null. Call stack: ${new Error().stack}`);
    }
  }
}
