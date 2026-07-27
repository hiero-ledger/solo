// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import fs from 'node:fs/promises';
import {DefaultCacheHealthInspector} from '../../../../src/integration/cache/impl/default-cache-health-inspector.js';

describe('DefaultCacheHealthInspector', (): void => {
  let inspector: DefaultCacheHealthInspector;
  let accessStub: SinonStub;
  let statStub: SinonStub;

  beforeEach((): void => {
    inspector = new DefaultCacheHealthInspector();
    accessStub = sinon.stub(fs, 'access');
    statStub = sinon.stub(fs, 'stat');
  });

  afterEach((): void => sinon.restore());

  describe('exists', (): void => {
    it('should return true when access succeeds', async (): Promise<void> => {
      accessStub.resolves();

      expect(await inspector.exists('/tmp/file')).to.be.true;
    });

    it('should return false when access fails', async (): Promise<void> => {
      accessStub.rejects(new Error('missing'));

      expect(await inspector.exists('/tmp/file')).to.be.false;
    });
  });

  describe('getSize', (): void => {
    it('should return stat size', async (): Promise<void> => {
      statStub.resolves({size: 1234});

      expect(await inspector.getSize('/tmp/file')).to.equal(1234);
    });
  });

  describe('filterExisting', (): void => {
    it('should return only existing paths', async (): Promise<void> => {
      accessStub.onFirstCall().resolves();
      accessStub.onSecondCall().rejects(new Error('missing'));
      accessStub.onThirdCall().resolves();

      const result: readonly string[] = await inspector.filterExisting(['/a', '/b', '/c']);

      expect(result).to.deep.equal(['/a', '/c']);
    });

    it('should return empty array when none exist', async (): Promise<void> => {
      accessStub.rejects(new Error('missing'));

      const result: readonly string[] = await inspector.filterExisting(['/a', '/b']);

      expect(result).to.deep.equal([]);
    });
  });
});
