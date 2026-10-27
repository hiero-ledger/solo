// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {
  AccountCreateTransaction,
  type AccountId,
  FileAppendTransaction,
  FileCreateTransaction,
  FileInfoQuery,
  FileUpdateTransaction,
  type Client,
  FileContentsQuery,
  FileId,
  PrecheckStatusError,
  PrivateKey,
  Status,
  type TransactionResponse,
  type FileInfo,
} from '@hiero-ledger/sdk';
import {SdkHederaClient} from '../../../../src/integration/hedera/impl/sdk-hedera-client.js';
import {type HederaFileTransactionResult} from '../../../../src/integration/hedera/hedera-file-transaction-result.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';

function makePrecheckStatusError(status: Status): PrecheckStatusError {
  const precheckStatusError: PrecheckStatusError = Object.create(PrecheckStatusError.prototype) as PrecheckStatusError;
  precheckStatusError.status = status;
  precheckStatusError.message = `precheck failed with ${status.toString()}`;
  return precheckStatusError;
}

function makeCreateAccountResponse(accountId: string): TransactionResponse {
  return {
    getReceipt: sinon.stub().resolves({accountId: {toString: (): string => accountId}}),
  } as unknown as TransactionResponse;
}

function makeClient(): {client: SdkHederaClient; logger: SoloLogger} {
  const logger: SoloLogger = {warn: sinon.stub(), debug: sinon.stub()} as unknown as SoloLogger;
  return {client: new SdkHederaClient({} as Client, logger), logger};
}

describe('SdkHederaClient', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  describe('createAccount', (): void => {
    it('retries once when account creation hits DUPLICATE_TRANSACTION precheck', async (): Promise<void> => {
      const {client, logger}: {client: SdkHederaClient; logger: SoloLogger} = makeClient();
      const executeStub: sinon.SinonStub = sinon.stub(AccountCreateTransaction.prototype, 'execute');
      executeStub.onFirstCall().rejects(makePrecheckStatusError(Status.DuplicateTransaction));
      executeStub.onSecondCall().resolves(makeCreateAccountResponse('0.0.7001'));

      const accountId: AccountId = await client.createAccount(PrivateKey.generateED25519(), 11, false);

      expect(accountId.toString()).to.equal('0.0.7001');
      expect(executeStub.callCount).to.equal(2);
      expect((logger.warn as sinon.SinonStub).callCount).to.equal(1);
    });

    it('does not retry for non-duplicate precheck failures', async (): Promise<void> => {
      const {client, logger}: {client: SdkHederaClient; logger: SoloLogger} = makeClient();
      const invalidSignatureError: PrecheckStatusError = makePrecheckStatusError(Status.InvalidSignature);
      const executeStub: sinon.SinonStub = sinon.stub(AccountCreateTransaction.prototype, 'execute');
      executeStub.rejects(invalidSignatureError);

      try {
        await client.createAccount(PrivateKey.generateED25519(), 11, false);
        expect.fail('expected createAccount to reject');
      } catch (error) {
        expect(error).to.equal(invalidSignatureError);
      }

      expect(executeStub.callCount).to.equal(1);
      expect((logger.warn as sinon.SinonStub).callCount).to.equal(0);
    });

    it('rethrows the duplicate error once the attempts are used up', async (): Promise<void> => {
      const {client}: {client: SdkHederaClient} = makeClient();
      const duplicateError: PrecheckStatusError = makePrecheckStatusError(Status.DuplicateTransaction);
      const executeStub: sinon.SinonStub = sinon.stub(AccountCreateTransaction.prototype, 'execute');
      executeStub.rejects(duplicateError);

      try {
        await client.createAccount(PrivateKey.generateED25519(), 11, false);
        expect.fail('expected createAccount to reject');
      } catch (error) {
        expect(error).to.equal(duplicateError);
      }

      expect(executeStub.callCount).to.equal(3);
    });
  });

  describe('getFileContents', (): void => {
    const fileId: FileId = new FileId(0, 0, 102);

    it('does not retry INVALID_NODE_ACCOUNT unless asked to', async (): Promise<void> => {
      const {client}: {client: SdkHederaClient} = makeClient();
      const invalidNodeAccountError: PrecheckStatusError = makePrecheckStatusError(Status.InvalidNodeAccount);
      const executeStub: sinon.SinonStub = sinon
        .stub(FileContentsQuery.prototype, 'execute')
        .rejects(invalidNodeAccountError);

      try {
        await client.getFileContents(fileId);
        expect.fail('expected getFileContents to reject');
      } catch (error) {
        expect(error).to.equal(invalidNodeAccountError);
      }

      expect(executeStub.callCount).to.equal(1);
    });

    it('retries INVALID_NODE_ACCOUNT when asked to', async (): Promise<void> => {
      const clock: sinon.SinonFakeTimers = sinon.useFakeTimers({shouldClearNativeTimers: true});
      const {client, logger}: {client: SdkHederaClient; logger: SoloLogger} = makeClient();
      const contents: Uint8Array = new Uint8Array([1, 2, 3]);
      const executeStub: sinon.SinonStub = sinon.stub(FileContentsQuery.prototype, 'execute');
      executeStub.onFirstCall().rejects(makePrecheckStatusError(Status.InvalidNodeAccount));
      executeStub.onSecondCall().resolves(contents);

      const result: Promise<Uint8Array> = client.getFileContents(fileId, true);
      await clock.tickAsync(5000);

      expect(await result).to.equal(contents);
      expect(executeStub.callCount).to.equal(2);
      expect((logger.warn as sinon.SinonStub).callCount).to.equal(1);
      clock.restore();
    });
  });

  describe('getFileInfo', (): void => {
    const fileId: FileId = new FileId(0, 0, 150);

    it('maps the size and the key count', async (): Promise<void> => {
      const {client}: {client: SdkHederaClient} = makeClient();
      sinon.stub(FileInfoQuery.prototype, 'execute').resolves({
        size: {toNumber: (): number => 42},
        keys: {toArray: (): unknown[] => [1, 2]},
      } as unknown as FileInfo);

      expect(await client.getFileInfo(fileId)).to.deep.equal({size: 42, keyCount: 2});
    });

    it('reports a file without keys as having none', async (): Promise<void> => {
      const {client}: {client: SdkHederaClient} = makeClient();
      sinon.stub(FileInfoQuery.prototype, 'execute').resolves({
        size: {toNumber: (): number => 7},
        keys: undefined,
      } as unknown as FileInfo);

      expect(await client.getFileInfo(fileId)).to.deep.equal({size: 7, keyCount: 0});
    });

    for (const status of [Status.FileDeleted, Status.InvalidFileId]) {
      it(`returns undefined for ${status.toString()}`, async (): Promise<void> => {
        const {client}: {client: SdkHederaClient} = makeClient();
        sinon.stub(FileInfoQuery.prototype, 'execute').rejects(makePrecheckStatusError(status));

        expect(await client.getFileInfo(fileId)).to.equal(undefined);
      });
    }

    it('rethrows any other failure', async (): Promise<void> => {
      const {client}: {client: SdkHederaClient} = makeClient();
      const failure: PrecheckStatusError = makePrecheckStatusError(Status.InvalidSignature);
      sinon.stub(FileInfoQuery.prototype, 'execute').rejects(failure);

      try {
        await client.getFileInfo(fileId);
        expect.fail('expected getFileInfo to reject');
      } catch (error) {
        expect(error).to.equal(failure);
      }
    });
  });

  describe('file transactions', (): void => {
    const fileId: FileId = new FileId(0, 0, 150);
    const contents: Uint8Array = new Uint8Array([1, 2, 3]);

    function stubFileTransaction(
      prototype: FileCreateTransaction | FileUpdateTransaction | FileAppendTransaction,
      receipt: {status: Status; fileId?: FileId},
    ): sinon.SinonStub {
      sinon.stub(prototype, 'freezeWith').returnsThis();
      sinon.stub(prototype, 'sign').returnsThis();
      return sinon.stub(prototype, 'execute').resolves({getReceipt: sinon.stub().resolves(receipt)} as never);
    }

    it('createFile returns the id of the new file', async (): Promise<void> => {
      const {client}: {client: SdkHederaClient} = makeClient();
      const executeStub: sinon.SinonStub = stubFileTransaction(FileCreateTransaction.prototype, {
        status: Status.Success,
        fileId,
      });

      const result: HederaFileTransactionResult = await client.createFile(contents, PrivateKey.generateED25519());

      expect(result.isSuccess).to.equal(true);
      expect(result.status).to.equal('SUCCESS');
      expect(result.fileId).to.equal(fileId);
      expect(executeStub.callCount).to.equal(1);
    });

    it('updateFile reports a failed status instead of throwing', async (): Promise<void> => {
      const {client}: {client: SdkHederaClient} = makeClient();
      stubFileTransaction(FileUpdateTransaction.prototype, {status: Status.InvalidSignature});

      const result: HederaFileTransactionResult = await client.updateFile(
        fileId,
        contents,
        PrivateKey.generateED25519(),
      );

      expect(result.isSuccess).to.equal(false);
      expect(result.status).to.equal('INVALID_SIGNATURE');
      expect(result.fileId).to.equal(undefined);
    });

    it('appendFile reports success', async (): Promise<void> => {
      const {client}: {client: SdkHederaClient} = makeClient();
      stubFileTransaction(FileAppendTransaction.prototype, {status: Status.Success});

      const result: HederaFileTransactionResult = await client.appendFile(
        fileId,
        contents,
        PrivateKey.generateED25519(),
      );

      expect(result.isSuccess).to.equal(true);
    });
  });
});
