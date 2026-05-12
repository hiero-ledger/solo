// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {ImageCacheHandlerBuilder} from '../../../../src/integration/cache/impl/image-cache-handler-builder.js';
import {StaticCacheTargetProvider} from '../../../../src/integration/cache/target-providers/static-cache-target-provider.js';
import {ImageCacheHandler} from '../../../../src/integration/cache/impl/image-cache-handler.js';

describe('ImageCacheHandlerBuilder', (): void => {
  const engine = {
    pullImage: async (): Promise<void> => undefined,
    saveImage: async (): Promise<void> => undefined,
    loadImage: async (): Promise<void> => undefined,
    loadImageArchiveIntoCluster: async (): Promise<void> => undefined,
    removeImage: async (): Promise<void> => undefined,
  };

  it('should throw when provider is missing', (): void => {
    expect(() => new ImageCacheHandlerBuilder().engine(engine as never).build()).to.throw(
      'ImageCacheHandlerBuilder: provider must be set',
    );
  });

  it('should throw when engine is missing', (): void => {
    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([]);
    expect(() => new ImageCacheHandlerBuilder().provider(provider).build()).to.throw(
      'ImageCacheHandlerBuilder: engine must be set',
    );
  });

  it('should build ImageCacheHandler when provider and engine are set', (): void => {
    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([]);
    const result: ImageCacheHandler = new ImageCacheHandlerBuilder()
      .provider(provider)
      .engine(engine as never)
      .build();

    expect(result).to.be.instanceOf(ImageCacheHandler);
  });

  it('fromYaml should return builder instance', (): void => {
    const result: ImageCacheHandlerBuilder = ImageCacheHandlerBuilder.fromYaml('/tmp/images.yaml');

    expect(result).to.be.instanceOf(ImageCacheHandlerBuilder);
  });
});
