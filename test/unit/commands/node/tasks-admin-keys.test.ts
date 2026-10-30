// SPDX-License-Identifier: Apache-2.0

import {describe, it, beforeEach, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import fs from 'node:fs';
import {PrivateKey} from '@hiero-ledger/sdk';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {NodeCommandConfigs} from '../../../../src/commands/node/configs.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {GenesisNetworkDataConstructor} from '../../../../src/core/genesis-network-models/genesis-network-data-constructor.js';
import {GenesisKeyResolver} from '../../../../src/core/genesis-key-resolver.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type ConsensusNode} from '../../../../src/core/model/consensus-node.js';
import {InvalidAdminPublicKeySoloError} from '../../../../src/core/errors/classes/validation/invalid-admin-public-key-solo-error.js';
import {AdminKeysCountMismatchSoloError} from '../../../../src/core/errors/classes/validation/admin-keys-count-mismatch-solo-error.js';
import * as constants from '../../../../src/core/constants.js';
import {type ArgvStruct} from '../../../../src/types/aliases.js';
import {type SoloListrTaskWrapper} from '../../../../src/types/index.js';
import {type NodeSetupContext} from '../../../../src/commands/node/config-interfaces/node-setup-context.js';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';

const invokeSetupConfigBuilder: (configs: NodeCommandConfigs) => Promise<void> = async (
  configs: NodeCommandConfigs,
): Promise<void> => {
  const context: NodeSetupContext = {} as NodeSetupContext;
  const argv: ArgvStruct = {_: [], flags: {}} as ArgvStruct;
  const task: SoloListrTaskWrapper<NodeSetupContext> = {} as SoloListrTaskWrapper<NodeSetupContext>;
  await configs.setupConfigBuilder(argv, context, task);
};

const invokeGenerateNetworkJson: (tasks: NodeCommandTasks, consensusNodes: ConsensusNode[]) => Promise<string> = async (
  tasks: NodeCommandTasks,
  consensusNodes: ConsensusNode[],
): Promise<string> => {
  return await (
    tasks as unknown as {
      generateNetworkJson: (
        fileName: string,
        namespace: NamespaceName,
        consensusNodes: ConsensusNode[],
        stagingDirectory: string,
      ) => Promise<string>;
    }
  ).generateNetworkJson(constants.GENESIS_NETWORK_FILE, NamespaceName.of('solo-e2e'), consensusNodes, '/staging');
};

describe('NodeCommand admin public keys validation', (): void => {
  const consensusNodes: ConsensusNode[] = [
    {name: 'node1', nodeId: 0, cluster: 'cluster-1', context: 'context-1'} as unknown as ConsensusNode,
    {name: 'node2', nodeId: 1, cluster: 'cluster-1', context: 'context-1'} as unknown as ConsensusNode,
  ];

  afterEach((): void => {
    sinon.restore();
  });

  describe('setupConfigBuilder early validation', (): void => {
    let initializeSetupStub: SinonStub;

    function createConfigs(flagValue?: string): NodeCommandConfigs {
      const configs: NodeCommandConfigs = Object.create(NodeCommandConfigs.prototype) as NodeCommandConfigs;

      const configManager: {getConfig: SinonStub; getFlag: SinonStub; setFlag: SinonStub} = {
        getConfig: sinon.stub().returns({
          releaseTag: new SemanticVersion<string>('0.58.0'),
          force: false,
          nodeAliasesUnparsed: '',
          gossipEndpointPort: '',
          serviceEndpointPort: '',
        }),
        getFlag: sinon.stub(),
        setFlag: sinon.stub(),
      };
      configManager.getFlag.withArgs(flags.adminPublicKeys).returns(flagValue);
      configManager.getFlag.withArgs(flags.deployment).returns('solo-deployment');
      configManager.getFlag.withArgs(flags.namespace).returns('test-namespace');
      (configs as unknown as {configManager: unknown}).configManager = configManager;

      (configs as unknown as {remoteConfig: unknown}).remoteConfig = {
        configuration: {
          versions: {consensusNode: new SemanticVersion<string>('0.58.0')},
          state: {consensusNodes: []},
        },
        getConsensusNodes: (): ConsensusNode[] => consensusNodes,
      };

      (configs as unknown as {localConfig: unknown}).localConfig = {};
      (configs as unknown as {assertConsensusNodeCompatibility: SinonStub}).assertConsensusNodeCompatibility =
        sinon.stub();

      initializeSetupStub = sinon.stub().resolves();
      (configs as unknown as {initializeSetup: SinonStub}).initializeSetup = initializeSetupStub;

      return configs;
    }

    it('preserves fallback behavior when flag is omitted (undefined)', async (): Promise<void> => {
      const configs: NodeCommandConfigs = createConfigs();

      await invokeSetupConfigBuilder(configs);

      expect(initializeSetupStub.calledOnce).to.be.true;
    });

    it('rejects explicit empty string input before initializeSetup or platform fetch', async (): Promise<void> => {
      const configs: NodeCommandConfigs = createConfigs('');

      let thrownError: unknown;
      try {
        await invokeSetupConfigBuilder(configs);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).to.be.instanceOf(InvalidAdminPublicKeySoloError);
      expect(initializeSetupStub.called, 'initializeSetup must not be called on validation failure').to.be.false;
    });

    it('rejects delimiter-only input before initializeSetup or platform fetch', async (): Promise<void> => {
      const configs: NodeCommandConfigs = createConfigs(' , , ');

      let thrownError: unknown;
      try {
        await invokeSetupConfigBuilder(configs);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).to.be.instanceOf(InvalidAdminPublicKeySoloError);
      expect(initializeSetupStub.called, 'initializeSetup must not be called on validation failure').to.be.false;
    });

    it('rejects count mismatch before initializeSetup or platform fetch', async (): Promise<void> => {
      const validKey: string = PrivateKey.generateED25519().publicKey.toString();
      const configs: NodeCommandConfigs = createConfigs(validKey); // 1 key for 2 nodes

      let thrownError: unknown;
      try {
        await invokeSetupConfigBuilder(configs);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).to.be.instanceOf(AdminKeysCountMismatchSoloError);
      expect(initializeSetupStub.called, 'initializeSetup must not be called on validation failure').to.be.false;
    });

    it('rejects malformed key and reports the offending node alias without leaking raw key', async (): Promise<void> => {
      const validKey: string = PrivateKey.generateED25519().publicKey.toString();
      const rawBadKey: string = 'secret-raw-bad-key-value-999';
      const configs: NodeCommandConfigs = createConfigs(`${validKey},${rawBadKey}`);

      let thrownError: unknown;
      try {
        await invokeSetupConfigBuilder(configs);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).to.be.instanceOf(InvalidAdminPublicKeySoloError);
      const validationError: InvalidAdminPublicKeySoloError = thrownError as InvalidAdminPublicKeySoloError;
      expect(validationError.message).to.include("for node 'node2'");
      expect(validationError.message).to.not.include(rawBadKey);
      expect(initializeSetupStub.called, 'initializeSetup must not be called on validation failure').to.be.false;
    });

    it('accepts valid ED25519 keys and proceeds to initializeSetup', async (): Promise<void> => {
      const key1: string = PrivateKey.generateED25519().publicKey.toString();
      const key2: string = PrivateKey.generateED25519().publicKey.toString();
      const configs: NodeCommandConfigs = createConfigs(`${key1},${key2}`);

      await invokeSetupConfigBuilder(configs);

      expect(initializeSetupStub.calledOnce).to.be.true;
    });
  });

  describe('tasks generateNetworkJson execution', (): void => {
    let genesisPrivateKey: PrivateKey;

    beforeEach((): void => {
      sinon.stub(fs, 'writeFileSync').returns();
      genesisPrivateKey = PrivateKey.generateED25519();
    });

    function createTasks(flagValue?: string): {
      tasks: NodeCommandTasks;
      genesisInitStub: SinonStub;
    } {
      const tasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

      const configManager: {getFlag: SinonStub} = {
        getFlag: sinon.stub(),
      };
      configManager.getFlag.withArgs(flags.adminPublicKeys).returns(flagValue);
      configManager.getFlag.withArgs(flags.deployment).returns('solo-deployment');
      configManager.getFlag.withArgs(flags.namespace).returns('test-namespace');
      (tasks as unknown as {configManager: unknown}).configManager = configManager;

      (tasks as unknown as {accountManager: unknown}).accountManager = {
        getNodeServiceMap: sinon.stub().resolves(new Map()),
      };

      (tasks as unknown as {remoteConfig: unknown}).remoteConfig = {
        getClusterRefs: sinon.stub().returns([]),
        getContexts: sinon.stub().returns([]),
      };

      (tasks as unknown as {k8Factory: unknown}).k8Factory = {};
      (tasks as unknown as {keyManager: unknown}).keyManager = {};

      sinon.stub(GenesisKeyResolver, 'resolve').resolves(genesisPrivateKey);

      const genesisInitStub: SinonStub = sinon.stub(GenesisNetworkDataConstructor, 'initialize').resolves({
        toJSON: (): string => '{}',
      } as unknown as GenesisNetworkDataConstructor);

      return {tasks, genesisInitStub};
    }

    it('passes genesis public key fallback array to constructor when flag is omitted (undefined)', async (): Promise<void> => {
      const {tasks, genesisInitStub} = createTasks();

      await invokeGenerateNetworkJson(tasks, consensusNodes);

      expect(genesisInitStub.calledOnce).to.be.true;
      const expectedGenesisPublicKey: string = genesisPrivateKey.publicKey.toString();
      const passedAdminKeys: string[] = genesisInitStub.firstCall.args[4] as string[];
      expect(passedAdminKeys).to.deep.equal([expectedGenesisPublicKey, expectedGenesisPublicKey]);
    });

    it('passes parsed keys to constructor when flag is provided', async (): Promise<void> => {
      const key1: string = PrivateKey.generateED25519().publicKey.toString();
      const key2: string = PrivateKey.generateED25519().publicKey.toString();
      const {tasks, genesisInitStub} = createTasks(`${key1},${key2}`);

      await invokeGenerateNetworkJson(tasks, consensusNodes);

      expect(genesisInitStub.calledOnce).to.be.true;
      const passedAdminKeys: string[] = genesisInitStub.firstCall.args[4] as string[];
      expect(passedAdminKeys).to.deep.equal([key1, key2]);
    });
  });
});
