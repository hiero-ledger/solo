// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import fs from 'node:fs/promises';
import {YamlHelmChartTargetProvider} from '../../../../src/integration/cache/target-providers/yaml-helm-chart-target-provider.js';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';

describe('YamlHelmChartTargetProvider', (): void => {
  let readFileStub: SinonStub;
  let provider: YamlHelmChartTargetProvider;

  beforeEach((): void => {
    readFileStub = sinon.stub(fs, 'readFile');
    provider = new YamlHelmChartTargetProvider('/tmp/charts.yaml');
  });

  afterEach((): void => sinon.restore());

  it('should parse charts from yaml file', async (): Promise<void> => {
    readFileStub.resolves(`
charts:
  - name: cert-manager
    source: jetstack
    version: v1.17.1
  - name: ingress-nginx
    source: ingress-nginx
    version: 4.11.3
`);

    const result = await provider.getRequiredTargets();

    expect(result).to.have.lengthOf(2);
    expect(result[0].type).to.equal(CacheArtifactEnum.HELM_CHART);
    expect(result[0].name).to.equal('cert-manager');
    expect(result[0].version).to.equal('v1.17.1');
    expect(result[0].source).to.equal('jetstack');
  });

  it('should return empty array when charts key is missing', async (): Promise<void> => {
    readFileStub.resolves('foo: bar');

    expect(await provider.getRequiredTargets()).to.deep.equal([]);
  });

  it('should return empty array when charts is empty', async (): Promise<void> => {
    readFileStub.resolves('charts: []');

    expect(await provider.getRequiredTargets()).to.deep.equal([]);
  });
});
