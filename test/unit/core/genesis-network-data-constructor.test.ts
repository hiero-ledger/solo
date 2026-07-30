// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {GenesisNetworkDataConstructor} from '../../../src/core/genesis-network-models/genesis-network-data-constructor.js';
import {type AccountManager} from '../../../src/core/account-manager.js';
import {type KeyManager} from '../../../src/core/key-manager.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {type NetworkNodeServices} from '../../../src/core/network-node-services.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {type EndpointPortMapping, type ServiceEndpoint} from '../../../src/types/index.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
import * as constants from '../../../src/core/constants.js';

describe('core/genesis-network-data-constructor', (): void => {
  const nodeAliases: NodeAlias[] = ['node1', 'node2'];

  const consensusNodes: ConsensusNode[] = nodeAliases.map(
    (nodeAlias: NodeAlias, index: number): ConsensusNode =>
      new ConsensusNode(nodeAlias, index, 'solo', 'solo-cluster', 'solo-cluster', 'cluster.local', '', '', [], []),
  );

  function networkNodeServiceMap(): NodeServiceMapping {
    const serviceMap: NodeServiceMapping = new Map();

    for (const [index, nodeAlias] of nodeAliases.entries()) {
      serviceMap.set(nodeAlias, {
        nodeId: index,
        accountId: `0.0.${index + 3}`,
        namespace: NamespaceName.of('solo'),
        externalAddress: `network-${nodeAlias}-svc.solo.svc.cluster.local`,
      } as unknown as NetworkNodeServices);
    }

    return serviceMap;
  }

  const keyManager: KeyManager = {
    getDerFromPem: (): Uint8Array => new Uint8Array([1, 2, 3]),
  } as unknown as KeyManager;

  const accountManager: AccountManager = {
    getGossipPublicKeyPem: async (): Promise<string> => 'gossip-public-key-pem',
    createOrReplaceAccountKeySecret: async (): Promise<void> => {},
  } as unknown as AccountManager;

  async function buildGenesisNetworkData(
    gossipEndpointPortMapping?: EndpointPortMapping,
    serviceEndpointPortMapping?: EndpointPortMapping,
  ): Promise<GenesisNetworkDataConstructor> {
    return await GenesisNetworkDataConstructor.initialize(
      consensusNodes,
      keyManager,
      accountManager,
      networkNodeServiceMap(),
      [],
      undefined,
      gossipEndpointPortMapping,
      serviceEndpointPortMapping,
    );
  }

  function gossipPorts(genesisNetworkData: GenesisNetworkDataConstructor): number[] {
    return nodeAliases.flatMap((nodeAlias: NodeAlias): number[] => [
      ...genesisNetworkData.nodes[nodeAlias].gossipEndpoint.map((endpoint: ServiceEndpoint): number => endpoint.port),
      ...genesisNetworkData.rosters[nodeAlias].gossipEndpoint.map((endpoint: ServiceEndpoint): number => endpoint.port),
    ]);
  }

  function servicePorts(genesisNetworkData: GenesisNetworkDataConstructor): number[] {
    return nodeAliases.flatMap((nodeAlias: NodeAlias): number[] =>
      genesisNetworkData.nodes[nodeAlias].serviceEndpoint.map((endpoint: ServiceEndpoint): number => endpoint.port),
    );
  }

  it('should use the default ports when no port override was supplied', async (): Promise<void> => {
    const genesisNetworkData: GenesisNetworkDataConstructor = await buildGenesisNetworkData();

    expect(gossipPorts(genesisNetworkData)).to.deep.equal(
      Array.from({length: 4}, (): number => +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT),
    );
    expect(servicePorts(genesisNetworkData)).to.deep.equal(Array.from({length: 2}, (): number => constants.GRPC_PORT));
  });

  it('should apply the default port of the override to every consensus node', async (): Promise<void> => {
    const genesisNetworkData: GenesisNetworkDataConstructor = await buildGenesisNetworkData(
      {defaultPort: 40_111, nodeAliasToPort: {}},
      {defaultPort: 40_211, nodeAliasToPort: {}},
    );

    expect(gossipPorts(genesisNetworkData)).to.deep.equal([40_111, 40_111, 40_111, 40_111]);
    expect(servicePorts(genesisNetworkData)).to.deep.equal([40_211, 40_211]);
  });

  it('should prefer the per node alias port over the default port', async (): Promise<void> => {
    const genesisNetworkData: GenesisNetworkDataConstructor = await buildGenesisNetworkData(
      {defaultPort: 40_111, nodeAliasToPort: {node2: 40_112}},
      {nodeAliasToPort: {node2: 40_212}},
    );

    expect(gossipPorts(genesisNetworkData)).to.deep.equal([40_111, 40_111, 40_112, 40_112]);
    expect(servicePorts(genesisNetworkData)).to.deep.equal([constants.GRPC_PORT, 40_212]);
  });
});
