// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {AccountId, AccountInfoQuery, Client, Hbar, Long, PrivateKey} from '@hiero-ledger/sdk';
import {proto} from '@hiero-ledger/proto';
import {SdkHederaClient} from '../../../src/integration/hedera/impl/sdk-hedera-client.js';
import {SdkHederaClientFactory} from '../../../src/integration/hedera/impl/sdk-hedera-client-factory.js';
import {AccountManager} from '../../../src/core/account-manager.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type HederaClient} from '../../../src/integration/hedera/hedera-client.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {GenesisKeyResolver} from '../../../src/core/genesis-key-resolver.js';
import {Templates} from '../../../src/core/templates.js';
import * as constants from '../../../src/core/constants.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import * as Base64 from 'js-base64';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
import {type NetworkNodeServices} from '../../../src/core/network-node-services.js';
import {ResourceNotFoundError} from '../../../src/integration/kube/errors/resource-operation-errors.js';
import {ResourceOperation} from '../../../src/integration/kube/resources/resource-operation.js';
import {ResourceType} from '../../../src/integration/kube/resources/resource-type.js';

type MockK8Factory = {
  getK8: sinon.SinonStub;
};

type CreateOrReplaceStub = sinon.SinonStub;

function makeAccountManager(createOrReplaceStub: CreateOrReplaceStub, loggerMock: SoloLogger): AccountManager {
  const k8FactoryMock: MockK8Factory = {
    getK8: sinon.stub().returns({
      secrets: (): {createOrReplace: CreateOrReplaceStub} => ({
        createOrReplace: createOrReplaceStub,
      }),
    }),
  };

  return new AccountManager(
    loggerMock,
    k8FactoryMock as unknown as K8Factory,
    {} as never,
    {} as never,
    {} as never,
    new SdkHederaClientFactory(loggerMock),
  );
}

function makeLogger(): SoloLogger {
  return {debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub()} as unknown as SoloLogger;
}

describe('AccountManager createNewAccount', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  it('creates the account through the Hedera client and stores its keys in a secret', async (): Promise<void> => {
    const createOrReplaceStub: CreateOrReplaceStub = sinon.stub().resolves(true);
    const loggerMock: SoloLogger = {warn: sinon.stub(), error: sinon.stub()} as unknown as SoloLogger;
    const accountManager: AccountManager = makeAccountManager(createOrReplaceStub, loggerMock);
    const createAccountStub: sinon.SinonStub = sinon.stub().resolves(AccountId.fromString('0.0.7001'));
    (accountManager as unknown as {_hederaClient: Partial<HederaClient>})._hederaClient = {
      createAccount: createAccountStub,
    };
    const privateKey: PrivateKey = PrivateKey.generateED25519();

    const createdAccount: {accountId: string; balance: number} = await accountManager.createNewAccount(
      NamespaceName.of('solo'),
      privateKey,
      11,
      false,
      'kind-solo',
    );

    expect(createdAccount.accountId).to.equal('0.0.7001');
    expect(createdAccount.balance).to.equal(11);
    expect(createAccountStub.calledOnceWithExactly(privateKey, 11, false)).to.equal(true);
    expect(createOrReplaceStub.callCount).to.equal(1);
  });

  it('does not store a secret when the Hedera client fails to create the account', async (): Promise<void> => {
    const createOrReplaceStub: CreateOrReplaceStub = sinon.stub().resolves(true);
    const loggerMock: SoloLogger = {warn: sinon.stub(), error: sinon.stub()} as unknown as SoloLogger;
    const accountManager: AccountManager = makeAccountManager(createOrReplaceStub, loggerMock);
    const failure: Error = new Error('invalid signature');
    (accountManager as unknown as {_hederaClient: Partial<HederaClient>})._hederaClient = {
      createAccount: sinon.stub().rejects(failure),
    };

    try {
      await accountManager.createNewAccount(
        NamespaceName.of('solo'),
        PrivateKey.generateED25519(),
        11,
        false,
        'kind-solo',
      );
      expect.fail('expected createNewAccount to reject');
    } catch (error) {
      expect(error).to.equal(failure);
    }

    expect(createOrReplaceStub.callCount).to.equal(0);
  });
});

function secretNotFound(): ResourceNotFoundError {
  return new ResourceNotFoundError(ResourceOperation.READ, ResourceType.SECRET, NamespaceName.of('solo'), 'secret');
}

function adminKeySecret(privateKey: PrivateKey): {data: Record<string, string>} {
  return {data: {privateKey: Base64.encode(privateKey.toStringDer())}};
}

describe('AccountManager getNodeAdminKey', (): void => {
  type FakeSecrets = {read: sinon.SinonStub; exists: sinon.SinonStub};

  const namespace: NamespaceName = NamespaceName.of('solo');
  const consensusNodes: ConsensusNode[] = [
    {name: 'node1', context: 'context-1'},
    {name: 'node2', context: 'context-2'},
  ] as unknown as ConsensusNode[];

  let secretsByContext: Map<string, FakeSecrets>;
  let getK8: sinon.SinonStub;
  let accountManager: AccountManager;

  beforeEach((): void => {
    secretsByContext = new Map(
      ['context-1', 'context-2'].map((context: string): [string, FakeSecrets] => [
        context,
        {read: sinon.stub().rejects(secretNotFound()), exists: sinon.stub().resolves(false)},
      ]),
    );
    getK8 = sinon.stub().callsFake((context: string): {secrets: () => FakeSecrets} => ({
      secrets: (): FakeSecrets => secretsByContext.get(context),
    }));

    // a bare prototype, so the test needs no dependency injection container
    accountManager = Object.create(AccountManager.prototype) as AccountManager;
    Object.assign(accountManager, {
      logger: {debug: sinon.stub()},
      k8Factory: {getK8},
      remoteConfig: {getContexts: (): string[] => ['context-1', 'context-2']},
    });
  });

  afterEach((): void => {
    sinon.restore();
  });

  it("reads and decodes the admin key secret in the node's own cluster context", async (): Promise<void> => {
    const node2AdminKey: PrivateKey = PrivateKey.generateED25519();
    secretsByContext
      .get('context-2')
      .read.withArgs(namespace, Templates.renderNodeAdminKeyName('node2'))
      .resolves(adminKeySecret(node2AdminKey));

    const adminKey: PrivateKey = await accountManager.getNodeAdminKey('node2' as NodeAlias, namespace, consensusNodes);

    expect(adminKey.toStringDer()).to.equal(node2AdminKey.toStringDer());
    expect(getK8.calledOnceWithExactly('context-2')).to.equal(true);
    expect(secretsByContext.get('context-1').read.called, 'the other cluster should not be read').to.equal(false);
  });

  it('falls back to the genesis key stored in the cluster when the node has no admin key secret', async (): Promise<void> => {
    const storedGenesisKey: PrivateKey = PrivateKey.generateED25519();
    const context2Secrets: FakeSecrets = secretsByContext.get('context-2');
    context2Secrets.exists.withArgs(namespace, GenesisKeyResolver.SECRET_NAME).resolves(true);
    context2Secrets.read.withArgs(namespace, GenesisKeyResolver.SECRET_NAME).resolves(adminKeySecret(storedGenesisKey));

    const adminKey: PrivateKey = await accountManager.getNodeAdminKey('node1' as NodeAlias, namespace, consensusNodes);

    expect(adminKey.toStringDer()).to.equal(storedGenesisKey.toStringDer());
  });

  it('falls back to the default genesis key when neither secret exists', async (): Promise<void> => {
    const adminKey: PrivateKey = await accountManager.getNodeAdminKey('node1' as NodeAlias, namespace, consensusNodes);

    expect(adminKey.toStringDer()).to.equal(PrivateKey.fromStringED25519(constants.GENESIS_KEY).toStringDer());
  });

  it('rethrows a failure to read the admin key secret other than it not existing', async (): Promise<void> => {
    const forbidden: Error = new Error('secrets "node1-admin" is forbidden');
    secretsByContext
      .get('context-1')
      .read.withArgs(namespace, Templates.renderNodeAdminKeyName('node1'))
      .rejects(forbidden);

    await expect(accountManager.getNodeAdminKey('node1' as NodeAlias, namespace, consensusNodes)).to.be.rejectedWith(
      forbidden,
    );
    expect(secretsByContext.get('context-1').exists.called, 'the genesis key should not be looked up').to.equal(false);
  });
});

describe('AccountManager node client ping', (): void => {
  // the operator (treasury) account is deliberately not a node account: SDK 2.89.0+ rejects pings to it
  const operatorAccountId: string = '0.0.2';
  const nodeAccountId: string = '0.0.3';
  const operatorKey: string = PrivateKey.generateED25519().toStringDer();

  afterEach((): void => {
    sinon.restore();
  });

  it('pings a configured node account, not the operator, when creating the client', async (): Promise<void> => {
    const accountManager: AccountManager = makeAccountManager(sinon.stub(), makeLogger());
    sinon
      .stub(accountManager as unknown as {configureNodeAccess: () => unknown}, 'configureNodeAccess')
      .resolves({'127.0.0.1:50211': AccountId.fromString(nodeAccountId)});
    const costStub: sinon.SinonStub = sinon.stub(AccountInfoQuery.prototype, 'getCost').resolves(Hbar.fromTinybars(1));
    const networkNodeServicesMap: NodeServiceMapping = new Map([
      ['node1', {nodeAlias: 'node1', accountId: nodeAccountId} as unknown as NetworkNodeServices],
    ]);

    const nodeClient: HederaClient = await accountManager._getNodeClient(
      NamespaceName.of('solo'),
      networkNodeServicesMap,
      operatorAccountId,
      operatorKey,
    );

    expect(costStub.callCount).to.equal(1);
    const query: AccountInfoQuery = costStub.firstCall.thisValue;
    expect(query.nodeAccountIds?.map((accountId: AccountId): string => accountId.toString())).to.deep.equal([
      nodeAccountId,
    ]);
    expect(nodeClient.operatorAccountId?.toString()).to.equal(operatorAccountId);
    nodeClient.close();
  });

  it('retries another configured node when the first node is unavailable', async (): Promise<void> => {
    const accountManager: AccountManager = makeAccountManager(sinon.stub(), makeLogger());
    const nodeClient: Client = Client.fromConfig({
      network: {'127.0.0.1:50211': nodeAccountId, '127.0.0.1:50213': '0.0.4'},
      scheduleNetworkUpdate: false,
    });
    nodeClient.setOperator(operatorAccountId, operatorKey);
    nodeClient.setMaxAttempts(3).setMinBackoff(1).setMaxBackoff(1).setGrpcDeadline(100).setRequestTimeout(1000);
    const hederaClient: HederaClient = new SdkHederaClient(nodeClient, makeLogger());
    (accountManager as unknown as {_hederaClient: HederaClient})._hederaClient = hederaClient;
    const unavailableEndpoint: string = Object.keys(nodeClient.network)[0];
    const attemptedEndpoints: string[] = [];
    const refreshStub: sinon.SinonStub = sinon
      .stub(accountManager, 'refreshNodeClient')
      .rejects(new Error('a healthy configured node should avoid refreshing the client'));
    sinon
      .stub(AccountInfoQuery.prototype, '_execute')
      .callsFake(
        async (
          channel: Parameters<AccountInfoQuery['_execute']>[0],
          request: proto.IQuery,
        ): Promise<proto.IResponse> => {
          expect(request.cryptoGetInfo?.header?.responseType).to.equal(proto.ResponseType.COST_ANSWER);
          if (!('address' in channel) || typeof channel.address !== 'string') {
            throw new Error('expected a Node.js SDK channel');
          }
          attemptedEndpoints.push(channel.address);
          if (channel.address === unavailableEndpoint) {
            throw Object.assign(new Error('node unavailable'), {code: 14, details: 'node unavailable'});
          }
          return {
            cryptoGetInfo: {
              header: {nodeTransactionPrecheckCode: proto.ResponseCodeEnum.OK, cost: Long.fromNumber(1)},
            },
          };
        },
      );

    try {
      const loadedClient: HederaClient = await accountManager.loadNodeClient(
        NamespaceName.of('solo'),
        {} as never,
        'deployment' as never,
      );

      expect(loadedClient).to.equal(hederaClient);
      expect(attemptedEndpoints).to.have.length(2);
      expect(attemptedEndpoints[0]).to.equal(unavailableEndpoint);
      expect(attemptedEndpoints[1]).not.to.equal(unavailableEndpoint);
      expect(refreshStub.callCount).to.equal(0);
    } finally {
      nodeClient.close();
    }
  });

  it('pings a configured node account, not the operator, when reusing the client', async (): Promise<void> => {
    const accountManager: AccountManager = makeAccountManager(sinon.stub(), makeLogger());
    const nodeClient: Client = Client.fromConfig({
      network: {'127.0.0.1:50211': nodeAccountId},
      scheduleNetworkUpdate: false,
    });
    nodeClient.setOperator(operatorAccountId, operatorKey);
    const hederaClient: HederaClient = new SdkHederaClient(nodeClient, makeLogger());
    (accountManager as unknown as {_hederaClient: HederaClient})._hederaClient = hederaClient;
    const costStub: sinon.SinonStub = sinon.stub(AccountInfoQuery.prototype, 'getCost').resolves(Hbar.fromTinybars(1));
    const refreshStub: sinon.SinonStub = sinon.stub(accountManager, 'refreshNodeClient');

    const loadedClient: HederaClient = await accountManager.loadNodeClient(
      NamespaceName.of('solo'),
      {} as never,
      'deployment' as never,
    );

    expect(loadedClient).to.equal(hederaClient);
    expect(costStub.callCount).to.equal(1);
    const query: AccountInfoQuery = costStub.firstCall.thisValue;
    expect(query.nodeAccountIds?.map((accountId: AccountId): string => accountId.toString())).to.deep.equal([
      nodeAccountId,
    ]);
    expect(refreshStub.callCount).to.equal(0);
    nodeClient.close();
  });
});
