// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import fs from 'node:fs/promises';
import {YamlImageTargetProvider} from '../../../../src/integration/cache/target-providers/yaml-image-target-provider.js';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';

describe('YamlImageTargetProvider', (): void => {
  let readFileStub: SinonStub;
  let provider: YamlImageTargetProvider;

  beforeEach((): void => {
    readFileStub = sinon.stub(fs, 'readFile');
    provider = new YamlImageTargetProvider('/tmp/images.yaml');
  });

  afterEach((): void => sinon.restore());

  it('should parse images from yaml file', async (): Promise<void> => {
    readFileStub.resolves(`
images:
  - name: ghcr.io/hashgraph/solo
    source: ghcr.io
    version: 1.0.0
  - name: ghcr.io/hashgraph/consensus-node
    version: 2.0.0
`);

    const result = await provider.getRequiredTargets();

    expect(result).to.have.lengthOf(2);
    expect(result[0].type).to.equal(CacheArtifactEnum.IMAGE);
    expect(result[0].name).to.equal('ghcr.io/hashgraph/solo');
    expect(result[0].version).to.equal('1.0.0');
    expect(result[0].source).to.equal('ghcr.io');

    expect(result[1].type).to.equal(CacheArtifactEnum.IMAGE);
    expect(result[1].name).to.equal('ghcr.io/hashgraph/consensus-node');
    expect(result[1].version).to.equal('2.0.0');
    expect(result[1].source).to.equal(undefined);
  });

  it('should return empty array when images key is missing', async (): Promise<void> => {
    readFileStub.resolves('foo: bar');

    expect(await provider.getRequiredTargets()).to.deep.equal([]);
  });

  it('should return empty array when images is empty', async (): Promise<void> => {
    readFileStub.resolves('images: []');

    expect(await provider.getRequiredTargets()).to.deep.equal([]);
  });
});
