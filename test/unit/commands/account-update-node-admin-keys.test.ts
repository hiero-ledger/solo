// SPDX-License-Identifier: Apache-2.0

import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {Base64} from 'js-base64';
import sinon, {type SinonStub} from 'sinon';
import {
  AccountId,
  PrivateKey,
  ReceiptStatusError,
  Status,
  TransactionId,
  type TransactionReceipt,
} from '@hiero-ledger/sdk';
import {AccountCommand} from '../../../src/commands/account.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {Templates} from '../../../src/core/templates.js';
import {NodeAccessConfigFailedSoloError} from '../../../src/core/errors/classes/component/node-access-config-failed-solo-error.js';
import {type DeploymentName} from '../../../src/types/index.js';
import {type NodeAlias, type NodeAliases} from '../../../src/types/aliases.js';

type FakeConsensusNode = {name: NodeAlias; nodeId: number; cluster: string; context: string};
type FakeLogger = {debug: SinonStub; showUser: SinonStub};
type UpdateNodeAdminKeys = (
  namespace: NamespaceName,
  deployment: DeploymentName,
  nodeAliases: NodeAliases,
) => Promise<void>;

const namespace: NamespaceName = NamespaceName.of('solo-e2e');
const deployment: DeploymentName = 'solo-deployment';
const nodeAliases: NodeAliases = ['node1', 'node2'];
const consensusNodes: FakeConsensusNode[] = nodeAliases.map((name: NodeAlias, nodeId: number): FakeConsensusNode => ({
  name,
  nodeId,
  cluster: `cluster-${nodeId + 1}`,
  context: `context-${nodeId + 1}`,
}));

function receiptStatusError(status: Status): ReceiptStatusError {
  return new ReceiptStatusError({
    status,
    transactionId: TransactionId.generate(AccountId.fromString('0.0.2')),
    transactionReceipt: {status} as unknown as TransactionReceipt,
  });
}

describe('AccountCommand node admin key update', (): void => {
  const currentAdminKeys: Record<NodeAlias, PrivateKey> = {
    node1: PrivateKey.generateED25519(),
    node2: PrivateKey.generateED25519(),
  };

  let logger: FakeLogger;
  let updateNodeAdminKey: SinonStub;
  let createOrReplace: SinonStub;
  let getK8: SinonStub;
  let updateNodeAdminKeys: UpdateNodeAdminKeys;

  beforeEach((): void => {
    logger = {debug: sinon.stub(), showUser: sinon.stub()};
    updateNodeAdminKey = sinon.stub().resolves({isSuccess: true, status: Status.Success.toString()});
    createOrReplace = sinon.stub().resolves(true);
    getK8 = sinon.stub().returns({secrets: (): {createOrReplace: SinonStub} => ({createOrReplace})});

    const command: AccountCommand = Object.create(AccountCommand.prototype) as AccountCommand;
    Object.assign(command, {
      logger,
      k8Factory: {getK8},
      remoteConfig: {
        getConsensusNodes: (): FakeConsensusNode[] => consensusNodes,
        getClusterRefs: (): Record<string, string> => ({}),
      },
      accountManager: {
        getNodeAdminKey: (nodeAlias: NodeAlias): Promise<PrivateKey> => Promise.resolve(currentAdminKeys[nodeAlias]),
        refreshNodeClient: sinon.stub().resolves(),
        hederaClient: {updateNodeAdminKey},
      },
    });

    // the rotation is a private step of `ledger system init`; call it directly rather than running the whole command
    updateNodeAdminKeys = (command as unknown as {updateNodeAdminKeys: UpdateNodeAdminKeys}).updateNodeAdminKeys.bind(
      command,
    );
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('warns and moves on to the next node when the network rejects the rotation with INVALID_SIGNATURE', async (): Promise<void> => {
    updateNodeAdminKey.onFirstCall().rejects(receiptStatusError(Status.InvalidSignature));

    await updateNodeAdminKeys(namespace, deployment, nodeAliases);

    expect(updateNodeAdminKey.callCount, 'the next node should still be rotated').to.equal(2);
    expect(logger.showUser.calledOnce).to.be.true;
    expect(logger.showUser.firstCall.args[0]).to.include('node1').and.to.include('INVALID_SIGNATURE');

    // the rejected node keeps its admin key secret; only the rotated node's secret is replaced, in its own context
    expect(createOrReplace.calledOnce).to.be.true;
    expect(createOrReplace.firstCall.args[1]).to.equal(Templates.renderNodeAdminKeyName('node2'));
    expect(getK8.calledOnceWithExactly('context-2')).to.be.true;
  });

  it('signs each rotation with the node current admin key', async (): Promise<void> => {
    await updateNodeAdminKeys(namespace, deployment, nodeAliases);

    expect(updateNodeAdminKey.firstCall.args[0]).to.equal(0);
    expect(updateNodeAdminKey.firstCall.args[2]).to.equal(currentAdminKeys.node1);
    expect(updateNodeAdminKey.secondCall.args[0]).to.equal(1);
    expect(updateNodeAdminKey.secondCall.args[2]).to.equal(currentAdminKeys.node2);
  });

  it("saves each node's new admin key in the node's own cluster context", async (): Promise<void> => {
    await updateNodeAdminKeys(namespace, deployment, nodeAliases);

    expect(getK8.args).to.deep.equal([['context-1'], ['context-2']]);
    expect(createOrReplace.firstCall.args[1]).to.equal(Templates.renderNodeAdminKeyName('node1'));
    expect(createOrReplace.secondCall.args[1]).to.equal(Templates.renderNodeAdminKeyName('node2'));

    // the saved key is the one the network was told to use
    for (const [index, nodeAlias] of nodeAliases.entries()) {
      const newKey: PrivateKey = updateNodeAdminKey.getCall(index).args[1];
      const savedData: {privateKey: string} = createOrReplace.getCall(index).args[3];
      expect(Base64.decode(savedData.privateKey), nodeAlias).to.equal(newKey.toStringDer());
    }
  });

  it('fails on any other receipt status without warning or saving a key', async (): Promise<void> => {
    updateNodeAdminKey.rejects(receiptStatusError(Status.InvalidNodeId));

    await expect(updateNodeAdminKeys(namespace, deployment, nodeAliases)).to.be.rejectedWith(
      NodeAccessConfigFailedSoloError,
    );
    expect(updateNodeAdminKey.calledOnce, 'no further node should be rotated').to.be.true;
    expect(logger.showUser.called).to.be.false;
    expect(createOrReplace.called).to.be.false;
  });

  it('fails on a non-receipt error without warning or saving a key', async (): Promise<void> => {
    updateNodeAdminKey.rejects(new Error('connection refused'));

    await expect(updateNodeAdminKeys(namespace, deployment, nodeAliases)).to.be.rejectedWith(
      NodeAccessConfigFailedSoloError,
    );
    expect(logger.showUser.called).to.be.false;
    expect(createOrReplace.called).to.be.false;
  });
});
