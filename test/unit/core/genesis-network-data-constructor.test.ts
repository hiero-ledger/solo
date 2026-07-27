// SPDX-License-Identifier: Apache-2.0

import {type AccountId, PrivateKey} from '@hiero-ledger/sdk';
import {expect} from 'chai';
import {describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import * as constants from '../../../src/core/constants.js';
import {GenesisNetworkDataConstructor} from '../../../src/core/genesis-network-models/genesis-network-data-constructor.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {NetworkNodeServices} from '../../../src/core/network-node-services.js';
import {type AccountManager} from '../../../src/core/account-manager.js';
import {type KeyManager} from '../../../src/core/key-manager.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {type ServiceEndpoint} from '../../../src/types/index.js';

describe('GenesisNetworkDataConstructor', (): void => {
  it('should register both grpc and grpcs service endpoints in node metadata', async (): Promise<void> => {
    const generatedAdminKey: PrivateKey = PrivateKey.generateED25519();
    const generateEd25519Stub: SinonStub = sinon.stub(PrivateKey, 'generateED25519').returns(generatedAdminKey);
    const consensusNode: ConsensusNode = new ConsensusNode(
      'node1' as NodeAlias,
      0,
      'solo-e2e',
      'solo-e2e',
      'context1',
      'cluster.local',
      'network-{nodeAlias}-svc.{namespace}.svc',
      'network-node1-svc.solo-e2e.svc.cluster.local',
      [],
      [],
    );
    const networkNodeServices: NetworkNodeServices = new NetworkNodeServices(
      'solo-e2e',
      'context1',
      'deployment',
      consensusNode.name,
      NamespaceName.of('solo-e2e'),
      0,
      PodName.of('network-node1-0'),
      'haproxy-node1-svc',
      '',
      '',
      constants.GRPC_PORT,
      constants.GRPCS_PORT,
      '0.0.3',
      'app=haproxy-node1',
      PodName.of('haproxy-node1-0'),
      'network-node1-svc',
      '',
      '',
      50_210,
      constants.GRPC_PORT,
      constants.GRPCS_PORT,
      'envoy-proxy-node1-svc',
      '',
      '',
      constants.GRPC_WEB_PORT,
      'node1.example.com',
    );
    const accountManagerStub: AccountManager = {
      createOrReplaceAccountKeySecret: sinon.stub().resolves(),
      getGossipPublicKeyPem: sinon.stub().resolves('test-pem'),
    } as unknown as AccountManager;
    const keyManagerStub: KeyManager = {
      getDerFromPem: sinon.stub().returns(Uint8Array.from([1, 2, 3])),
    } as unknown as KeyManager;

    try {
      const constructor: GenesisNetworkDataConstructor = await GenesisNetworkDataConstructor.initialize(
        [consensusNode],
        keyManagerStub,
        accountManagerStub,
        new Map([[consensusNode.name, networkNodeServices]]),
        [],
        {node1: 'grpc.node1.example.com'},
      );

      const serviceEndpoints: ServiceEndpoint[] = constructor.nodes[consensusNode.name].serviceEndpoint;
      const accountId: AccountId = constructor.nodes[consensusNode.name].accountId;

      expect(accountId.toString()).to.equal('0.0.3');
      expect(serviceEndpoints).to.deep.equal([
        {
          domainName: 'grpc.node1.example.com',
          port: constants.GRPC_PORT,
          ipAddressV4: undefined,
        },
        {
          domainName: 'grpc.node1.example.com',
          port: constants.GRPCS_PORT,
          ipAddressV4: undefined,
        },
      ]);
      expect(constructor.nodes[consensusNode.name].adminKey.toString()).to.equal(
        generatedAdminKey.publicKey.toString(),
      );
    } finally {
      generateEd25519Stub.restore();
    }
  });
});
