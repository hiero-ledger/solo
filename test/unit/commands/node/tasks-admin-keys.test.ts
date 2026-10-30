// SPDX-License-Identifier: Apache-2.0

import {describe, it, beforeEach, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import fs from 'node:fs';
import {PrivateKey} from '@hiero-ledger/sdk';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {GenesisNetworkDataConstructor} from '../../../../src/core/genesis-network-models/genesis-network-data-constructor.js';
import {GenesisKeyResolver} from '../../../../src/core/genesis-key-resolver.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type ConsensusNode} from '../../../../src/core/model/consensus-node.js';
import {InvalidAdminPublicKeySoloError} from '../../../../src/core/errors/classes/validation/invalid-admin-public-key-solo-error.js';
import * as constants from '../../../../src/core/constants.js';

describe('NodeCommandTasks admin public keys validation', (): void => {
  const consensusNodes: ConsensusNode[] = [
    {name: 'node1', nodeId: 0, cluster: 'cluster-1', context: 'context-1'} as unknown as ConsensusNode,
    {name: 'node2', nodeId: 1, cluster: 'cluster-1', context: 'context-1'} as unknown as ConsensusNode,
  ];

  let _fsWriteStub: SinonStub;
  let genesisPrivateKey: PrivateKey;

  beforeEach((): void => {
    _fsWriteStub = sinon.stub(fs, 'writeFileSync').returns();
    genesisPrivateKey = PrivateKey.generateED25519();
  });

  afterEach((): void => {
    sinon.restore();
  });

  function createTasks(flagValue?: string): {
    tasks: NodeCommandTasks;
    getNodeServiceMapStub: SinonStub;
    resolveGenesisKeyStub: SinonStub;
    genesisInitStub: SinonStub;
  } {
    const tasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

    const configManager: {getFlag: SinonStub} = {
      getFlag: sinon.stub(),
    };
    configManager.getFlag.withArgs(flags.adminPublicKeys).returns(flagValue);
    configManager.getFlag.withArgs(flags.deployment).returns('solo-deployment');
    (tasks as unknown as {configManager: unknown}).configManager = configManager;

    const getNodeServiceMapStub: SinonStub = sinon.stub().resolves(new Map());
    (tasks as unknown as {accountManager: unknown}).accountManager = {
      getNodeServiceMap: getNodeServiceMapStub,
    };

    const remoteConfig: {getClusterRefs: SinonStub; getContexts: SinonStub} = {
      getClusterRefs: sinon.stub().returns([]),
      getContexts: sinon.stub().returns([]),
    };
    (tasks as unknown as {remoteConfig: unknown}).remoteConfig = remoteConfig;

    (tasks as unknown as {k8Factory: unknown}).k8Factory = {};
    (tasks as unknown as {keyManager: unknown}).keyManager = {};

    const resolveGenesisKeyStub: SinonStub = sinon.stub(GenesisKeyResolver, 'resolve').resolves(genesisPrivateKey);

    const genesisInitStub: SinonStub = sinon.stub(GenesisNetworkDataConstructor, 'initialize').resolves({
      toJSON: (): string => '{}',
    } as unknown as GenesisNetworkDataConstructor);

    return {tasks, getNodeServiceMapStub, resolveGenesisKeyStub, genesisInitStub};
  }

  async function invokeGenerateNetworkJson(tasks: NodeCommandTasks): Promise<string> {
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
  }

  it('preserves fallback to genesis key when flag is omitted (undefined)', async (): Promise<void> => {
    const {tasks, getNodeServiceMapStub, resolveGenesisKeyStub, genesisInitStub} = createTasks();

    await invokeGenerateNetworkJson(tasks);

    expect(getNodeServiceMapStub.calledOnce).to.be.true;
    expect(resolveGenesisKeyStub.calledOnce).to.be.true;
    expect(genesisInitStub.calledOnce).to.be.true;

    const expectedGenesisPublicKey: string = genesisPrivateKey.publicKey.toString();
    const passedAdminKeys: string[] = genesisInitStub.firstCall.args[4] as string[];
    expect(passedAdminKeys).to.deep.equal([expectedGenesisPublicKey, expectedGenesisPublicKey]);
  });

  it('rejects explicit empty string input before expensive network discovery or secret generation', async (): Promise<void> => {
    const {tasks, getNodeServiceMapStub, resolveGenesisKeyStub, genesisInitStub} = createTasks('');

    let thrownError: unknown;
    try {
      await invokeGenerateNetworkJson(tasks);
    } catch (error: unknown) {
      thrownError = error;
    }

    expect(thrownError).to.be.instanceOf(InvalidAdminPublicKeySoloError);
    expect(getNodeServiceMapStub.called, 'expensive getNodeServiceMap must not be called').to.be.false;
    expect(resolveGenesisKeyStub.called, 'expensive resolveGenesisKey must not be called').to.be.false;
    expect(genesisInitStub.called, 'GenesisNetworkDataConstructor.initialize must not be called').to.be.false;
  });

  it('rejects delimiter-only input before expensive network discovery or secret generation', async (): Promise<void> => {
    const {tasks, getNodeServiceMapStub, resolveGenesisKeyStub, genesisInitStub} = createTasks(' , , ');

    let thrownError: unknown;
    try {
      await invokeGenerateNetworkJson(tasks);
    } catch (error: unknown) {
      thrownError = error;
    }

    expect(thrownError).to.be.instanceOf(InvalidAdminPublicKeySoloError);
    expect(getNodeServiceMapStub.called, 'expensive getNodeServiceMap must not be called').to.be.false;
    expect(resolveGenesisKeyStub.called, 'expensive resolveGenesisKey must not be called').to.be.false;
    expect(genesisInitStub.called, 'GenesisNetworkDataConstructor.initialize must not be called').to.be.false;
  });

  it('parses and passes valid ED25519 keys', async (): Promise<void> => {
    const key1: string = PrivateKey.generateED25519().publicKey.toString();
    const key2: string = PrivateKey.generateED25519().publicKey.toString();
    const {tasks, getNodeServiceMapStub, resolveGenesisKeyStub, genesisInitStub} = createTasks(`${key1},${key2}`);

    await invokeGenerateNetworkJson(tasks);

    expect(getNodeServiceMapStub.calledOnce).to.be.true;
    expect(resolveGenesisKeyStub.calledOnce).to.be.true;
    expect(genesisInitStub.calledOnce).to.be.true;

    const passedAdminKeys: string[] = genesisInitStub.firstCall.args[4] as string[];
    expect(passedAdminKeys).to.deep.equal([key1, key2]);
  });

  it('rejects malformed public key before expensive network discovery or secret generation', async (): Promise<void> => {
    const rawMalformedKey: string = 'invalid-malformed-ed25519-key-secret-12345';
    const {tasks, getNodeServiceMapStub, resolveGenesisKeyStub, genesisInitStub} = createTasks(
      `${rawMalformedKey},${rawMalformedKey}`,
    );

    let thrownError: unknown;
    try {
      await invokeGenerateNetworkJson(tasks);
    } catch (error: unknown) {
      thrownError = error;
    }

    expect(thrownError).to.be.instanceOf(InvalidAdminPublicKeySoloError);
    expect(getNodeServiceMapStub.called, 'expensive getNodeServiceMap must not be called').to.be.false;
    expect(resolveGenesisKeyStub.called, 'expensive resolveGenesisKey must not be called').to.be.false;
    expect(genesisInitStub.called, 'GenesisNetworkDataConstructor.initialize must not be called').to.be.false;
  });

  it('identifies the actual offending node alias and does not leak raw public key in error message', async (): Promise<void> => {
    const validKey: string = PrivateKey.generateED25519().publicKey.toString();
    const rawBadKey: string = 'secret-raw-bad-key-value-999';
    const {tasks} = createTasks(`${validKey},${rawBadKey}`);

    let thrownError: unknown;
    try {
      await invokeGenerateNetworkJson(tasks);
    } catch (error: unknown) {
      thrownError = error;
    }

    expect(thrownError).to.be.instanceOf(InvalidAdminPublicKeySoloError);
    const validationError: InvalidAdminPublicKeySoloError = thrownError as InvalidAdminPublicKeySoloError;

    // Must report the actual offending node alias ('node2')
    expect(validationError.message).to.include("for node 'node2'");

    // Must NEVER reveal the raw supplied key
    expect(validationError.message).to.not.include(rawBadKey);
    expect(validationError.message).to.not.include(validKey);
  });
});
