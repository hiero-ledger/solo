// SPDX-License-Identifier: Apache-2.0

import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import sinon, {type SinonSpy, type SinonSpyCall, type SinonStub} from 'sinon';
import {Base64} from 'js-base64';
import {
  AccountId,
  Client,
  NodeUpdateTransaction,
  PrivateKey,
  ReceiptStatusError,
  Status,
  TransactionId,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {NodeSubcommandType} from '../../../../src/core/enumerations.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {Templates} from '../../../../src/core/templates.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import * as constants from '../../../../src/core/constants.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../../src/types/index.js';
import {type AnyListrContext, type NodeAlias} from '../../../../src/types/aliases.js';

type FakeConsensusNode = {name: NodeAlias; nodeId: number; cluster: string; context: string};
type FakeLogger = {debug: SinonStub; showUser: SinonStub};
type NodeSigner = {nodeId: number; key: string};

const namespace: NamespaceName = NamespaceName.of('solo-e2e');
const nodeAliases: NodeAlias[] = ['node1', 'node2'];
const consensusNodes: FakeConsensusNode[] = nodeAliases.map((name: NodeAlias, nodeId: number): FakeConsensusNode => ({
  name,
  nodeId,
  cluster: 'cluster-1',
  context: 'context-1',
}));
const genesisKey: PrivateKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);

function createTasks(
  adminKeySecrets: Record<string, PrivateKey>,
  client: Client,
  logger: FakeLogger,
): NodeCommandTasks {
  const tasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

  // Only the per-node admin key secrets exist; there is no stored genesis key secret, so the default key applies.
  const secrets: {read: unknown; exists: unknown} = {
    read: async (secretNamespace: NamespaceName, name: string): Promise<{data: Record<string, string>}> => {
      const key: PrivateKey = adminKeySecrets[name];
      if (!key || secretNamespace.name !== namespace.name) {
        throw new Error(`secret ${name} not found`);
      }
      return {data: {privateKey: Base64.encode(key.toString()), publicKey: Base64.encode(key.publicKey.toString())}};
    },
    exists: async (): Promise<boolean> => false,
  };

  Object.assign(tasks, {
    k8Factory: {getK8: (): {secrets: () => unknown} => ({secrets: (): unknown => secrets})},
    accountManager: {
      getNodeServiceMap: async (): Promise<Map<NodeAlias, unknown>> =>
        new Map(
          consensusNodes.map((node: FakeConsensusNode): [NodeAlias, unknown] => [
            node.name,
            {
              nodeId: node.nodeId,
              context: node.context,
              envoyProxyName: `envoy-proxy-${node.name}`,
              envoyProxyGrpcWebPort: 8080,
              nodeServiceClusterIp: `10.0.0.${node.nodeId + 1}`,
              nodeServiceGrpcPort: 50_211,
            },
          ]),
        ),
      loadNodeClient: async (): Promise<Client> => client,
    },
    remoteConfig: {
      getClusterRefs: (): Record<string, string> => ({}),
      getConsensusNodes: (): FakeConsensusNode[] => consensusNodes,
      getContexts: (): string[] => ['context-1'],
      configuration: {clusters: [{namespace: namespace.name, dnsBaseDomain: 'cluster.local'}]},
    },
    logger,
  });

  return tasks;
}

async function runTask(task: SoloListrTask<AnyListrContext>, config: Record<string, unknown>): Promise<void> {
  await task.task({config} as unknown as AnyListrContext, {} as unknown as SoloListrTaskWrapper<AnyListrContext>);
}

async function setGrpcWebEndpoint(tasks: NodeCommandTasks): Promise<void> {
  await runTask(
    tasks.setGrpcWebEndpoint('nodeAliases', NodeSubcommandType.START) as unknown as SoloListrTask<AnyListrContext>,
    {namespace, deployment: 'solo-deployment', nodeAliases, consensusNodes},
  );
}

function responseWithStatus(status: Status): TransactionResponse {
  return {
    getReceipt: async (): Promise<TransactionReceipt> => {
      if (status !== Status.Success) {
        throw new ReceiptStatusError({
          status,
          transactionId: TransactionId.generate(AccountId.fromString('0.0.2')),
          transactionReceipt: {status} as unknown as TransactionReceipt,
        });
      }
      return {status} as unknown as TransactionReceipt;
    },
  } as unknown as TransactionResponse;
}

describe('NodeCommandTasks admin key signing', (): void => {
  const node1AdminKey: PrivateKey = PrivateKey.generateED25519();
  const adminKeySecrets: Record<string, PrivateKey> = {[Templates.renderNodeAdminKeyName('node1')]: node1AdminKey};

  let client: Client;
  let logger: FakeLogger;
  let tasks: NodeCommandTasks;
  let signSpy: SinonSpy;
  let executeStub: SinonStub;

  beforeEach((): void => {
    client = Client.forNetwork({'127.0.0.1:50211': AccountId.fromString('0.0.3')}).setOperator(
      AccountId.fromString('0.0.2'),
      genesisKey,
    );
    logger = {debug: sinon.stub(), showUser: sinon.stub()};
    tasks = createTasks(adminKeySecrets, client, logger);
    signSpy = sinon.spy(NodeUpdateTransaction.prototype, 'sign');
    executeStub = sinon.stub(NodeUpdateTransaction.prototype, 'execute').resolves(responseWithStatus(Status.Success));
  });

  afterEach((): void => {
    sinon.restore();
    client.close();
  });

  describe('setGrpcWebEndpoint', (): void => {
    it('signs each node update with that node admin key, or the genesis key when it has none', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks);

      const signers: NodeSigner[] = signSpy.getCalls().map((call: SinonSpyCall): NodeSigner => ({
        nodeId: (call.thisValue as NodeUpdateTransaction).nodeId.toNumber(),
        key: (call.args[0] as PrivateKey).toString(),
      }));
      expect(signers).to.deep.equal([
        {nodeId: 0, key: node1AdminKey.toString()},
        {nodeId: 1, key: genesisKey.toString()},
      ]);
      expect(executeStub.callCount).to.equal(2);
    });

    it('warns and moves on when the network rejects the admin key signature', async (): Promise<void> => {
      executeStub.onFirstCall().resolves(responseWithStatus(Status.InvalidSignature));

      await setGrpcWebEndpoint(tasks);

      expect(executeStub.callCount, 'the next node should still be updated').to.equal(2);
      expect(logger.showUser.calledOnce).to.be.true;
      expect(logger.showUser.firstCall.args[0]).to.include('node1').and.to.include('INVALID_SIGNATURE');
    });

    it('still fails on any other node update error', async (): Promise<void> => {
      executeStub.resolves(responseWithStatus(Status.InvalidNodeId));

      await expect(setGrpcWebEndpoint(tasks)).to.be.rejectedWith(SoloError);
      expect(logger.showUser.called).to.be.false;
    });
  });

  describe('loadAdminKey', (): void => {
    it('loads the node admin key from its secret', async (): Promise<void> => {
      const config: Record<string, unknown> = {nodeAlias: 'node1', namespace, consensusNodes};

      await runTask(tasks.loadAdminKey() as unknown as SoloListrTask<AnyListrContext>, config);

      expect((config.adminKey as PrivateKey).toString()).to.equal(node1AdminKey.toString());
    });

    it('falls back to the genesis key for a node without an admin key secret', async (): Promise<void> => {
      const config: Record<string, unknown> = {nodeAlias: 'node2', namespace, consensusNodes};

      await runTask(tasks.loadAdminKey() as unknown as SoloListrTask<AnyListrContext>, config);

      expect((config.adminKey as PrivateKey).toString()).to.equal(genesisKey.toString());
    });
  });
});
