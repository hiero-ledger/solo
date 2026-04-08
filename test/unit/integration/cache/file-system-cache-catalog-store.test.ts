// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import fs from 'node:fs/promises';
import {FileSystemCacheCatalogStore} from '../../../../src/integration/cache/impl/file-system-cache-catalog-store.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';

describe('FileSystemCacheCatalogStore', (): void => {
  let store: FileSystemCacheCatalogStore;
  let mkdirStub: SinonStub;
  let writeFileStub: SinonStub;
  let readFileStub: SinonStub;
  let accessStub: SinonStub;
  let rmStub: SinonStub;

  const homePath: string = '/home/test';
  const baseDirectory: string = PathEx.join(homePath, 'cache');
  const catalogPath: string = PathEx.join(baseDirectory, 'cache-catalog.json');

  beforeEach((): void => {
    store = new FileSystemCacheCatalogStore(homePath);
    mkdirStub = sinon.stub(fs, 'mkdir');
    writeFileStub = sinon.stub(fs, 'writeFile');
    readFileStub = sinon.stub(fs, 'readFile');
    accessStub = sinon.stub(fs, 'access');
    rmStub = sinon.stub(fs, 'rm');
  });

  afterEach((): void => sinon.restore());

  it('should save catalog to cache-catalog.json', async (): Promise<void> => {
    const catalog = {items: [{id: '1'}]};

    await store.save(catalog as never);

    expect(mkdirStub).to.have.been.calledOnceWith(baseDirectory, {recursive: true});
    expect(writeFileStub).to.have.been.calledOnceWith(catalogPath, JSON.stringify(catalog, undefined, 2));
  });

  it('should load catalog from cache-catalog.json', async (): Promise<void> => {
    readFileStub.resolves('{"items":[{"id":"1"}]}');

    const result = await store.load();

    expect(readFileStub).to.have.been.calledOnceWith(catalogPath, 'utf8');
    expect(result).to.deep.equal({items: [{id: '1'}]});
  });

  it('should return true from exists when file is accessible', async (): Promise<void> => {
    accessStub.resolves();

    expect(await store.exists()).to.be.true;
  });

  it('should return false from exists when file is not accessible', async (): Promise<void> => {
    accessStub.rejects(new Error('missing'));

    expect(await store.exists()).to.be.false;
  });

  it('should clear cache directory', async (): Promise<void> => {
    await store.clear();

    expect(rmStub).to.have.been.calledOnceWith(baseDirectory, {recursive: true, force: true});
  });

  it('should resolve safe artifact path', (): void => {
    const target = {
      name: 'ghcr.io/hashgraph/solo:test',
      version: '1.2.3',
    };

    const result: string = store.resolvePath(target as never, CacheArtifactEnum.IMAGE);

    expect(result).to.equal(
      PathEx.join(baseDirectory, CacheArtifactEnum.IMAGE, 'ghcr.io__hashgraph__solo__test__1.2.3.tar'),
    );
  });
});
