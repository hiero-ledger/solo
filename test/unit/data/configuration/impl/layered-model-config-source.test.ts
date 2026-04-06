// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {LayeredModelConfigSource} from '../../../../../src/data/configuration/impl/layered-model-config-source.js';
import {YamlFileStorageBackend} from '../../../../../src/data/backend/impl/yaml-file-storage-backend.js';

describe('LayeredModelConfigSource', (): void => {
  it('constructor with null ObjectMapper throws error', (): void => {
    expect((): void => {
      // @ts-expect-error - testing protected constructor
      new LayeredModelConfigSource(undefined, undefined, undefined, undefined);
    }).to.throw('ObjectMapper is required');
  });

  it('test modelData getter and setter', (): void => {
    // @ts-expect-error - testing protected constructor
    const source = new LayeredModelConfigSource('key', {}, new YamlFileStorageBackend('.'), {});
    source.modelData = 'modelData';
    expect(source.modelData).to.equal('modelData');
  });
});
