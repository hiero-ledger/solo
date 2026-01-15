// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../types/aliases.js';
import {type ClusterReferenceName, type PriorityMapping} from '../../types/index.js';

export class ConsensusNode {
  public constructor(
    public readonly name: NodeAlias,
    public readonly nodeId: number,
    public readonly namespace: string,
    public readonly cluster: ClusterReferenceName,
    public readonly context: string,
    public readonly dnsBaseDomain: string,
    public readonly dnsConsensusNodePattern: string,
    public readonly fullyQualifiedDomainName: string,
    public readonly blockNodeMap: PriorityMapping[],
  ) {
    if (!context) {
      throw new Error(`ConsensusNode context cannot be empty or null. Call stack: ${new Error().stack}`);
    }
  }
}
