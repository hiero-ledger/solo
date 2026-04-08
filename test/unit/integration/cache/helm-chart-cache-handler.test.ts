// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';
import {HelmChartCacheHandler} from '../../../../src/integration/cache/impl/helm-chart-cache-handler.js';

describe('HelmChartCacheHandler', (): void => {
  let handler: HelmChartCacheHandler;
  let mkdirStub: SinonStub;
  let rmStub: SinonStub;

  const store = {
    resolvePath: sinon.stub(),
  };

  const provider = {
    getRequiredTargets: sinon.stub(),
  };

  const inspector = {
    exists: sinon.stub(),
  };

  const helm = {
    pullChartPackage: sinon.stub(),
  };

  const chartTarget = {
    type: CacheArtifactEnum.HELM_CHART,
    name: 'cert-manager',
    version: 'v1.17.1',
    source: 'jetstack',
  };

  const imageTarget = {
    type: CacheArtifactEnum.IMAGE,
    name: 'ghcr.io/test/image',
    version: '1.0.0',
    source: 'ghcr.io',
  };

  beforeEach((): void => {
    mkdirStub = sinon.stub(fs, 'mkdir');
    rmStub = sinon.stub(fs, 'rm');

    provider.getRequiredTargets.resolves([chartTarget, imageTarget]);
    store.resolvePath.callsFake(
      (target: {name: string; version: string}) => `/cache/${target.name}-${target.version}.tgz`,
    );

    handler = new HelmChartCacheHandler(store as never, provider as never, inspector as never, helm as never);
  });

  afterEach((): void => sinon.restore());

  it('should return HELM_CHART type', (): void => {
    expect(handler.getType()).to.equal(CacheArtifactEnum.HELM_CHART);
  });

  it('should resolve only helm chart targets', async (): Promise<void> => {
    const result = await handler.resolveRequiredArtifacts();

    expect(result).to.deep.equal([chartTarget]);
  });

  it('should pull chart packages and return cached items', async (): Promise<void> => {
    const result = await handler.pull([chartTarget] as never);

    expect(mkdirStub).to.have.been.calledOnceWith(path.dirname('/cache/cert-manager-v1.17.1.tgz'), {
      recursive: true,
    });
    expect(helm.pullChartPackage).to.have.been.calledOnce;
    expect(result).to.have.lengthOf(1);
    expect(result[0].target).to.equal(chartTarget);
    expect(result[0].localPath).to.equal('/cache/cert-manager-v1.17.1.tgz');
  });

  it('load should do nothing', async (): Promise<void> => {
    await expect(handler.load([] as never)).to.be.fulfilled;
  });

  it('should clear chart archives', async (): Promise<void> => {
    await handler.clear([{localPath: '/cache/a.tgz'}] as never);

    expect(rmStub).to.have.been.calledOnceWith('/cache/a.tgz', {force: true});
  });

  it('should report chart archive health', async (): Promise<void> => {
    inspector.exists.onFirstCall().resolves(true);
    inspector.exists.onSecondCall().resolves(false);

    const items = [
      {target: chartTarget, localPath: '/cache/a.tgz'},
      {target: chartTarget, localPath: '/cache/b.tgz'},
    ];

    const result = await handler.healthcheck(items as never);

    expect(result).to.have.lengthOf(2);
    expect(result[0].healthy).to.be.true;
    expect(result[0].message).to.equal('chart archive exists');
    expect(result[1].healthy).to.be.false;
    expect(result[1].message).to.equal('chart archive missing');
  });
});
