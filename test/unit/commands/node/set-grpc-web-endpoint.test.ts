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
  type ServiceEndpoint,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {AccountManager} from '../../../../src/core/account-manager.js';
import {NodeSubcommandType} from '../../../../src/core/enumerations.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {Templates} from '../../../../src/core/templates.js';
import {SdkHederaClient} from '../../../../src/integration/hedera/impl/sdk-hedera-client.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import * as constants from '../../../../src/core/constants.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../../src/types/index.js';
import {type AnyListrContext, type NodeAlias} from '../../../../src/types/aliases.js';
import {ResourceNotFoundError} from '../../../../src/integration/kube/errors/resource-operation-errors.js';
import {ResourceOperation} from '../../../../src/integration/kube/resources/resource-operation.js';
import {ResourceType} from '../../../../src/integration/kube/resources/resource-type.js';

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
  const hederaClient: SdkHederaClient = new SdkHederaClient(client, logger as unknown as SoloLogger);

  // Only the per-node admin key secrets exist; there is no stored genesis key secret, so the default key applies.
  const secrets: {read: unknown; exists: unknown} = {
    read: async (secretNamespace: NamespaceName, name: string): Promise<{data: Record<string, string>}> => {
      const key: PrivateKey = adminKeySecrets[name];
      if (!key || secretNamespace.name !== namespace.name) {
        throw new ResourceNotFoundError(ResourceOperation.READ, ResourceType.SECRET, secretNamespace, name);
      }
      return {data: {privateKey: Base64.encode(key.toString()), publicKey: Base64.encode(key.publicKey.toString())}};
    },
    exists: async (): Promise<boolean> => false,
  };

  const k8Factory: unknown = {getK8: (): {secrets: () => unknown} => ({secrets: (): unknown => secrets})};
  const remoteConfig: unknown = {
    getClusterRefs: (): Record<string, string> => ({}),
    getConsensusNodes: (): FakeConsensusNode[] => consensusNodes,
    getContexts: (): string[] => ['context-1'],
    configuration: {clusters: [{namespace: namespace.name, dnsBaseDomain: 'cluster.local'}]},
  };

  // A real AccountManager prototype, so the node admin key lookup runs against the fake secrets
  const accountManager: AccountManager = Object.create(AccountManager.prototype) as AccountManager;

  Object.assign(tasks, {
    k8Factory,
    accountManager: Object.assign(accountManager, {
      k8Factory,
      remoteConfig,
      logger,
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
      loadNodeClient: async (): Promise<SdkHederaClient> => hederaClient,
    }),
    remoteConfig,
    logger,
  });

  return tasks;
}

async function runTask(task: SoloListrTask<AnyListrContext>, config: Record<string, unknown>): Promise<void> {
  await task.task({config} as unknown as AnyListrContext, {} as unknown as SoloListrTaskWrapper<AnyListrContext>);
}

async function setGrpcWebEndpoint(
  tasks: NodeCommandTasks,
  configOverrides: Record<string, unknown> = {},
): Promise<void> {
  await runTask(
    tasks.setGrpcWebEndpoint('nodeAliases', NodeSubcommandType.START) as unknown as SoloListrTask<AnyListrContext>,
    {namespace, deployment: 'solo-deployment', nodeAliases, consensusNodes, ...configOverrides},
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
  let setServiceEndpointsSpy: SinonSpy;
  let executeStub: SinonStub;

  beforeEach((): void => {
    client = Client.forNetwork({'127.0.0.1:50211': AccountId.fromString('0.0.3')}).setOperator(
      AccountId.fromString('0.0.2'),
      genesisKey,
    );
    logger = {debug: sinon.stub(), showUser: sinon.stub()};
    tasks = createTasks(adminKeySecrets, client, logger);
    signSpy = sinon.spy(NodeUpdateTransaction.prototype, 'sign');
    setServiceEndpointsSpy = sinon.spy(NodeUpdateTransaction.prototype, 'setServiceEndpoints');
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

    it('publishes only internal cluster IP endpoint by default', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks);

      expect(setServiceEndpointsSpy.callCount).to.equal(2);
      const node1Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.firstCall.args[0] as ServiceEndpoint[];
      expect(node1Endpoints).to.have.lengthOf(1);
      expect(node1Endpoints[0].getPort).to.equal(50_211);
      expect(node1Endpoints[0].getIpAddressV4).to.deep.equal(new Uint8Array([10, 0, 0, 1]));

      const node2Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.secondCall.args[0] as ServiceEndpoint[];
      expect(node2Endpoints).to.have.lengthOf(1);
      expect(node2Endpoints[0].getPort).to.equal(50_211);
      expect(node2Endpoints[0].getIpAddressV4).to.deep.equal(new Uint8Array([10, 0, 0, 2]));
    });

    it('publishes dual endpoints (internal + host) when publishHostEndpoints is true', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks, {publishHostEndpoints: true});

      expect(setServiceEndpointsSpy.callCount).to.equal(2);
      const node1Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.firstCall.args[0] as ServiceEndpoint[];
      expect(node1Endpoints).to.have.lengthOf(2);
      expect(node1Endpoints[0].getPort).to.equal(50_211);
      expect(node1Endpoints[0].getIpAddressV4).to.deep.equal(new Uint8Array([10, 0, 0, 1]));
      expect(node1Endpoints[1].getPort).to.equal(constants.GRPC_LOCAL_PORT);
      expect(node1Endpoints[1].getIpAddressV4).to.deep.equal(new Uint8Array([127, 0, 0, 1]));

      const node2Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.secondCall.args[0] as ServiceEndpoint[];
      expect(node2Endpoints).to.have.lengthOf(2);
      expect(node2Endpoints[0].getPort).to.equal(50_211);
      expect(node2Endpoints[0].getIpAddressV4).to.deep.equal(new Uint8Array([10, 0, 0, 2]));
      expect(node2Endpoints[1].getPort).to.equal(constants.GRPC_LOCAL_PORT + 1);
      expect(node2Endpoints[1].getIpAddressV4).to.deep.equal(new Uint8Array([127, 0, 0, 1]));
    });

    it('publishes custom host ports when serviceEndpointPortMapping is provided', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks, {
        publishHostEndpoints: true,
        serviceEndpointPortMapping: {nodeAliasToPort: {node2: 36_211}},
      });

      const node1Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.firstCall.args[0] as ServiceEndpoint[];
      expect(node1Endpoints[1].getPort).to.equal(constants.GRPC_LOCAL_PORT);

      const node2Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.secondCall.args[0] as ServiceEndpoint[];
      expect(node2Endpoints[1].getPort).to.equal(36_211);
    });

    it('publishes host endpoint with domain name when domainNamesMapping is provided', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks, {
        publishHostEndpoints: true,
        domainNamesMapping: {node1: 'node1.solo.local'},
      });

      const node1Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.firstCall.args[0] as ServiceEndpoint[];
      expect(node1Endpoints).to.have.lengthOf(2);
      expect(node1Endpoints[1].getDomainName).to.equal('node1.solo.local');
      expect(node1Endpoints[1].getPort).to.equal(constants.GRPC_LOCAL_PORT);

      expect(node1Endpoints[1].getIpAddressV4).to.be.null;
    });

    it('publishes host endpoint with custom external address when provided', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks, {
        publishHostEndpoints: true,
        externalAddress: '192.168.1.150',
      });

      const node1Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.firstCall.args[0] as ServiceEndpoint[];
      expect(node1Endpoints).to.have.lengthOf(2);
      expect(node1Endpoints[1].getIpAddressV4).to.deep.equal(new Uint8Array([192, 168, 1, 150]));
      expect(node1Endpoints[1].getPort).to.equal(constants.GRPC_LOCAL_PORT);
    });

    it('deduplicates when host endpoint matches internal endpoint', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks, {
        publishHostEndpoints: true,
        externalAddress: '10.0.0.1',
        serviceEndpointPortMapping: {nodeAliasToPort: {node1: 50_211}},
      });

      const node1Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.firstCall.args[0] as ServiceEndpoint[];
      expect(node1Endpoints).to.have.lengthOf(1);
      expect(node1Endpoints[0].getPort).to.equal(50_211);
    });

    it('does not publish host endpoint when serviceEndpointPortMapping is provided without publishHostEndpoints', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks, {
        serviceEndpointPortMapping: {nodeAliasToPort: {node1: 36_211}},
      });

      const node1Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.firstCall.args[0] as ServiceEndpoint[];
      expect(node1Endpoints).to.have.lengthOf(1);
      expect(node1Endpoints[0].getPort).to.equal(50_211);
    });

    it('normalizes 0.0.0.0 externalAddress to 127.0.0.1 in published host endpoint', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks, {
        publishHostEndpoints: true,
        externalAddress: '0.0.0.0',
      });

      const node1Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.firstCall.args[0] as ServiceEndpoint[];
      expect(node1Endpoints).to.have.lengthOf(2);
      expect(node1Endpoints[1].getIpAddressV4).to.deep.equal(new Uint8Array([127, 0, 0, 1]));
      expect(node1Endpoints[1].getPort).to.equal(constants.GRPC_LOCAL_PORT);
    });

    it('does not publish host endpoint when publishHostEndpoints is explicitly false even with serviceEndpointPortMapping', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks, {
        publishHostEndpoints: false,
        serviceEndpointPortMapping: {nodeAliasToPort: {node1: 36_211}},
      });

      const node1Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.firstCall.args[0] as ServiceEndpoint[];
      expect(node1Endpoints).to.have.lengthOf(1);
      expect(node1Endpoints[0].getPort).to.equal(50_211);
    });

    it('does not publish host endpoint when publishHostEndpoints is explicitly false', async (): Promise<void> => {
      await setGrpcWebEndpoint(tasks, {
        publishHostEndpoints: false,
      });

      const node1Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.firstCall.args[0] as ServiceEndpoint[];
      expect(node1Endpoints).to.have.lengthOf(1);
      expect(node1Endpoints[0].getPort).to.equal(50_211);
    });
  });

  describe('shouldPublishHostEndpoints', (): void => {
    it('returns true when publishHostEndpoints is true (Test A)', (): void => {
      expect(tasks.shouldPublishHostEndpoints({publishHostEndpoints: true}, 'node1')).to.be.true;
    });

    it('returns false when publishHostEndpoints is explicitly false without ConfigManager (Test B)', (): void => {
      expect(tasks.shouldPublishHostEndpoints({publishHostEndpoints: false}, 'node1')).to.be.false;
    });

    it('returns false when defaulted to false from CLI registration without mapping (Test C)', (): void => {
      (tasks as unknown as {configManager: unknown}).configManager = {
        wasFlagProvidedByUser: (): boolean => false,
        getFlag: (): boolean => false,
      };

      expect(tasks.shouldPublishHostEndpoints({publishHostEndpoints: false}, 'node1')).to.be.false;
      (tasks as unknown as {configManager: unknown}).configManager = undefined;
    });

    it('does not infer true when serviceEndpointPortMapping maps node and flag is omitted', (): void => {
      expect(
        tasks.shouldPublishHostEndpoints({serviceEndpointPortMapping: {nodeAliasToPort: {node1: 36_211}}}, 'node1'),
      ).to.be.false;
    });

    it('does not infer true when serviceEndpointPortMapping maps defaultPort and flag is omitted', (): void => {
      expect(
        tasks.shouldPublishHostEndpoints(
          {serviceEndpointPortMapping: {defaultPort: 36_211, nodeAliasToPort: {}}},
          'node1',
        ),
      ).to.be.false;
    });

    it('does not infer true when flag was defaulted from CLI registration and mapping is present', (): void => {
      (tasks as unknown as {configManager: unknown}).configManager = {
        wasFlagProvidedByUser: (): boolean => false,
        getFlag: (): boolean => false,
      };

      expect(
        tasks.shouldPublishHostEndpoints(
          {
            publishHostEndpoints: false,
            serviceEndpointPortMapping: {nodeAliasToPort: {node1: 36_211}},
          },
          'node1',
        ),
      ).to.be.false;
      (tasks as unknown as {configManager: unknown}).configManager = undefined;
    });

    it('returns false when publishHostEndpoints was explicitly provided as false via CLI even with mapping', (): void => {
      (tasks as unknown as {configManager: unknown}).configManager = {
        wasFlagProvidedByUser: (f: unknown): boolean => f === flags.publishHostEndpoints,
        getFlag: (): boolean => false,
      };

      expect(
        tasks.shouldPublishHostEndpoints(
          {
            publishHostEndpoints: false,
            serviceEndpointPortMapping: {nodeAliasToPort: {node1: 36_211}},
          },
          'node1',
        ),
      ).to.be.false;
      (tasks as unknown as {configManager: unknown}).configManager = undefined;
    });

    it('returns false when publishHostEndpoints is explicitly false in config without ConfigManager even with mapping', (): void => {
      expect(
        tasks.shouldPublishHostEndpoints(
          {
            publishHostEndpoints: false,
            serviceEndpointPortMapping: {nodeAliasToPort: {node1: 36_211}},
          },
          'node1',
        ),
      ).to.be.false;
    });
  });

  describe('isPublishHostEndpointsEnabled', (): void => {
    it('returns false by default when publishHostEndpoints is omitted', (): void => {
      expect(tasks.isPublishHostEndpointsEnabled({})).to.be.false;
    });

    it('returns false when publishHostEndpoints is false even with serviceEndpointPortMapping', (): void => {
      expect(
        tasks.isPublishHostEndpointsEnabled({
          publishHostEndpoints: false,
        }),
      ).to.be.false;
    });

    it('returns true when publishHostEndpoints is explicitly true in config', (): void => {
      expect(tasks.isPublishHostEndpointsEnabled({publishHostEndpoints: true})).to.be.true;
    });

    it('returns true when user provided publishHostEndpoints as true on CLI', (): void => {
      (tasks as unknown as {configManager: unknown}).configManager = {
        wasFlagProvidedByUser: (): boolean => true,
        getFlag: (): boolean => true,
      };

      expect(tasks.isPublishHostEndpointsEnabled({})).to.be.true;
      (tasks as unknown as {configManager: unknown}).configManager = undefined;
    });

    it('returns false when user explicitly provided publishHostEndpoints as false on CLI', (): void => {
      (tasks as unknown as {configManager: unknown}).configManager = {
        wasFlagProvidedByUser: (): boolean => true,
        getFlag: (): boolean => false,
      };

      expect(tasks.isPublishHostEndpointsEnabled({})).to.be.false;
      (tasks as unknown as {configManager: unknown}).configManager = undefined;
    });

    it('returns false when publishHostEndpoints was defaulted to false on CLI', (): void => {
      (tasks as unknown as {configManager: unknown}).configManager = {
        wasFlagProvidedByUser: (): boolean => false,
        getFlag: (): boolean => false,
      };

      expect(tasks.isPublishHostEndpointsEnabled({})).to.be.false;
      (tasks as unknown as {configManager: unknown}).configManager = undefined;
    });
  });

  describe('enablePortForwarding local port resolution', (): void => {
    let managePortForwardStub: SinonStub;

    beforeEach((): void => {
      managePortForwardStub = sinon.stub().resolves(35_211);
      const mockPods: {podReference: {name: string}; labels: Record<string, string>}[] = [
        {
          podReference: {name: 'haproxy-node1-abc'},
          labels: {'solo.hedera.com/node-id': '0', 'solo.hedera.com/node-name': 'node1'},
        },
        {
          podReference: {name: 'haproxy-node2-def'},
          labels: {'solo.hedera.com/node-id': '1', 'solo.hedera.com/node-name': 'node2'},
        },
      ];

      (tasks as unknown as {configManager: unknown}).configManager = {
        getFlag: sinon.stub(),
        wasFlagProvidedByUser: sinon.stub().returns(false),
      };
      (tasks as unknown as {k8Factory: unknown}).k8Factory = {
        getK8: (): unknown => ({
          pods: (): unknown => ({
            list: (): Promise<unknown[]> => Promise.resolve(mockPods),
          }),
        }),
      };
      (tasks as unknown as {remoteConfig: unknown}).remoteConfig = {
        getClusterRefs: (): Record<string, string> => ({}),
        getConsensusNodes: (): FakeConsensusNode[] => consensusNodes,
        getContexts: (): string[] => ['context-1'],
        configuration: {
          clusters: [{namespace: namespace.name, dnsBaseDomain: 'cluster.local'}],
          components: {
            managePortForward: managePortForwardStub,
          },
        },
        persist: sinon.stub().resolves(),
      };
    });

    afterEach((): void => {
      (tasks as unknown as {configManager: unknown}).configManager = undefined;
    });

    it('preserves legacy GRPC_LOCAL_PORT + nodeId when feature is disabled (Test A)', async (): Promise<void> => {
      const config: Record<string, unknown> = {
        namespace,
        consensusNodes,
        forcePortForward: true,
        isChartInstalled: false,
        publishHostEndpoints: false,
      };

      await (tasks.enablePortForwarding(true).task as (context_: {config: Record<string, unknown>}) => Promise<void>)({
        config,
      });

      expect(managePortForwardStub.callCount).to.equal(2);
      expect(managePortForwardStub.args[0][3]).to.equal(constants.GRPC_LOCAL_PORT); // node1 -> 35211
      expect(managePortForwardStub.args[1][3]).to.equal(constants.GRPC_LOCAL_PORT + 1); // node2 -> 35212
    });

    it('preserves legacy GRPC_LOCAL_PORT + nodeId when feature is disabled with serviceEndpointPortMapping configured (Test B)', async (): Promise<void> => {
      const config: Record<string, unknown> = {
        namespace,
        consensusNodes,
        forcePortForward: true,
        isChartInstalled: false,
        publishHostEndpoints: false,
        serviceEndpointPortMapping: {nodeAliasToPort: {node2: 36_211}},
      };

      await (tasks.enablePortForwarding(true).task as (context_: {config: Record<string, unknown>}) => Promise<void>)({
        config,
      });

      expect(managePortForwardStub.callCount).to.equal(2);
      expect(managePortForwardStub.args[0][3]).to.equal(constants.GRPC_LOCAL_PORT); // node1 -> 35211
      expect(managePortForwardStub.args[1][3]).to.equal(constants.GRPC_LOCAL_PORT + 1); // node2 -> 35212 (NOT 36211!)
    });

    it('uses configured host port when publishHostEndpoints is enabled with serviceEndpointPortMapping (Test C)', async (): Promise<void> => {
      const config: Record<string, unknown> = {
        namespace,
        consensusNodes,
        forcePortForward: true,
        isChartInstalled: false,
        publishHostEndpoints: true,
        serviceEndpointPortMapping: {nodeAliasToPort: {node2: 36_211}},
      };

      await (tasks.enablePortForwarding(true).task as (context_: {config: Record<string, unknown>}) => Promise<void>)({
        config,
      });

      expect(managePortForwardStub.callCount).to.equal(2);
      expect(managePortForwardStub.args[0][3]).to.equal(constants.GRPC_LOCAL_PORT); // node1 -> 35211
      expect(managePortForwardStub.args[1][3]).to.equal(36_211); // node2 -> 36211
    });

    it('uses GRPC_LOCAL_PORT + nodeId when publishHostEndpoints is enabled without mapping (Test D)', async (): Promise<void> => {
      const config: Record<string, unknown> = {
        namespace,
        consensusNodes,
        forcePortForward: true,
        isChartInstalled: false,
        publishHostEndpoints: true,
      };

      await (tasks.enablePortForwarding(true).task as (context_: {config: Record<string, unknown>}) => Promise<void>)({
        config,
      });

      expect(managePortForwardStub.callCount).to.equal(2);
      expect(managePortForwardStub.args[0][3]).to.equal(constants.GRPC_LOCAL_PORT); // node1 -> 35211
      expect(managePortForwardStub.args[1][3]).to.equal(constants.GRPC_LOCAL_PORT + 1); // node2 -> 35212
    });

    it('maintains consistency when service-endpoint-port is set without publish-host-endpoints (maintainer scenario)', async (): Promise<void> => {
      // 1. In setGrpcWebEndpoint: address book does not publish host endpoint (only cluster IP)
      await setGrpcWebEndpoint(tasks, {
        serviceEndpointPortMapping: {nodeAliasToPort: {node2: 36_211}},
      });
      const node2Endpoints: ServiceEndpoint[] = setServiceEndpointsSpy.secondCall.args[0] as ServiceEndpoint[];
      expect(node2Endpoints).to.have.lengthOf(1);
      expect(node2Endpoints[0].getPort).to.equal(50_211);

      // 2. In enablePortForwarding: port forwarding preserves legacy port (35212 for node2)
      const config: Record<string, unknown> = {
        namespace,
        consensusNodes,
        forcePortForward: true,
        isChartInstalled: false,
        serviceEndpointPortMapping: {nodeAliasToPort: {node2: 36_211}},
      };
      await (tasks.enablePortForwarding(true).task as (context_: {config: Record<string, unknown>}) => Promise<void>)({
        config,
      });
      expect(managePortForwardStub.callCount).to.equal(2);
      expect(managePortForwardStub.args[0][3]).to.equal(constants.GRPC_LOCAL_PORT); // node1 -> 35211
      expect(managePortForwardStub.args[1][3]).to.equal(constants.GRPC_LOCAL_PORT + 1); // node2 -> 35212, NOT 36211!
    });
  });

  describe('resolveHostGrpcPort', (): void => {
    it('prefers explicit CLI serviceEndpointPortMapping per node or default', (): void => {
      const port: number = tasks.resolveHostGrpcPort('node2', 1, {nodeAliasToPort: {node2: 36_211}});
      expect(port).to.equal(36_211);

      const defaultPort: number = tasks.resolveHostGrpcPort('node1', 0, {
        defaultPort: 39_211,
        nodeAliasToPort: {},
      });
      expect(defaultPort).to.equal(39_211);
    });

    it('prefers active RemoteConfig HAProxy port forward when CLI mapping is absent', (): void => {
      const mockComponent: {metadata: {portForwardConfigs: {podPort: number; localPort: number}[]}} = {
        metadata: {
          portForwardConfigs: [{podPort: constants.GRPC_PORT, localPort: 37_211}],
        },
      };
      (tasks as unknown as {remoteConfig: unknown}).remoteConfig = {
        configuration: {
          components: {
            getComponentById: (_type: unknown, id: number): unknown => {
              return id === 2 ? mockComponent : undefined; // node2 -> componentId 2
            },
          },
        },
      };

      const port: number = tasks.resolveHostGrpcPort('node2', 1);
      expect(port).to.equal(37_211);
    });

    it('falls back to deterministic default (GRPC_LOCAL_PORT + nodeId)', (): void => {
      const portNode1: number = tasks.resolveHostGrpcPort('node1', 0);
      expect(portNode1).to.equal(constants.GRPC_LOCAL_PORT);

      const portNode2: number = tasks.resolveHostGrpcPort('node2', 1);
      expect(portNode2).to.equal(constants.GRPC_LOCAL_PORT + 1);
    });
  });

  describe('buildHostServiceEndpoint', (): void => {
    it('normalizes wildcard 0.0.0.0 to 127.0.0.1 in IPv4 ServiceEndpoint', (): void => {
      const helper: (
        config: Record<string, unknown>,
        nodeAlias: NodeAlias,
        nodeId: number,
      ) => {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint} = (
        tasks as unknown as {
          buildHostServiceEndpoint: (
            config: Record<string, unknown>,
            nodeAlias: NodeAlias,
            nodeId: number,
          ) => {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint};
        }
      ).buildHostServiceEndpoint;

      const result: {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint} = helper.call(
        tasks,
        {externalAddress: '0.0.0.0'},
        'node1',
        0,
      );
      expect(result.hostAddress).to.equal(constants.LOCAL_HOST);
      expect(result.hostPort).to.equal(constants.GRPC_LOCAL_PORT);
      expect(result.hostServiceEndpoint.getIpAddressV4).to.deep.equal(new Uint8Array([127, 0, 0, 1]));
    });

    it('preserves valid IPv4 externalAddress', (): void => {
      const helper: (
        config: Record<string, unknown>,
        nodeAlias: NodeAlias,
        nodeId: number,
      ) => {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint} = (
        tasks as unknown as {
          buildHostServiceEndpoint: (
            config: Record<string, unknown>,
            nodeAlias: NodeAlias,
            nodeId: number,
          ) => {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint};
        }
      ).buildHostServiceEndpoint;

      const result: {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint} = helper.call(
        tasks,
        {externalAddress: '192.168.1.150'},
        'node1',
        0,
      );
      expect(result.hostAddress).to.equal('192.168.1.150');
      expect(result.hostPort).to.equal(constants.GRPC_LOCAL_PORT);
      expect(result.hostServiceEndpoint.getIpAddressV4).to.deep.equal(new Uint8Array([192, 168, 1, 150]));
    });

    it('constructs domainName ServiceEndpoint for domain names', (): void => {
      const helper: (
        config: Record<string, unknown>,
        nodeAlias: NodeAlias,
        nodeId: number,
      ) => {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint} = (
        tasks as unknown as {
          buildHostServiceEndpoint: (
            config: Record<string, unknown>,
            nodeAlias: NodeAlias,
            nodeId: number,
          ) => {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint};
        }
      ).buildHostServiceEndpoint;

      const result: {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint} = helper.call(
        tasks,
        {domainNamesMapping: {node1: 'node1.example.com'}},
        'node1',
        0,
      );
      expect(result.hostAddress).to.equal('node1.example.com');
      expect(result.hostPort).to.equal(constants.GRPC_LOCAL_PORT);
      expect(result.hostServiceEndpoint.getDomainName).to.equal('node1.example.com');
    });

    it('falls back to constants.LOCAL_HOST when no address is specified', (): void => {
      const helper: (
        config: Record<string, unknown>,
        nodeAlias: NodeAlias,
        nodeId: number,
      ) => {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint} = (
        tasks as unknown as {
          buildHostServiceEndpoint: (
            config: Record<string, unknown>,
            nodeAlias: NodeAlias,
            nodeId: number,
          ) => {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint};
        }
      ).buildHostServiceEndpoint;

      const result: {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint} = helper.call(
        tasks,
        {},
        'node1',
        0,
      );
      expect(result.hostAddress).to.equal(constants.LOCAL_HOST);
      expect(result.hostPort).to.equal(constants.GRPC_LOCAL_PORT);
      expect(result.hostServiceEndpoint.getIpAddressV4).to.deep.equal(new Uint8Array([127, 0, 0, 1]));
    });

    it('resolves custom host port from serviceEndpointPortMapping', (): void => {
      const helper: (
        config: Record<string, unknown>,
        nodeAlias: NodeAlias,
        nodeId: number,
      ) => {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint} = (
        tasks as unknown as {
          buildHostServiceEndpoint: (
            config: Record<string, unknown>,
            nodeAlias: NodeAlias,
            nodeId: number,
          ) => {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint};
        }
      ).buildHostServiceEndpoint;

      const result: {hostAddress: string; hostPort: number; hostServiceEndpoint: ServiceEndpoint} = helper.call(
        tasks,
        {serviceEndpointPortMapping: {nodeAliasToPort: {node2: 36_211}}},
        'node2',
        1,
      );
      expect(result.hostPort).to.equal(36_211);
      expect(result.hostServiceEndpoint.getPort).to.equal(36_211);
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
