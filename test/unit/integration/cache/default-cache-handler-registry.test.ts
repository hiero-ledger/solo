// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {DefaultCacheHandlerRegistry} from '../../../../src/integration/cache/impl/default-cache-handler-registry.js';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';

describe('DefaultCacheHandlerRegistry', (): void => {
  it('should register and retrieve a handler by type', (): void => {
    const registry: DefaultCacheHandlerRegistry = new DefaultCacheHandlerRegistry();
    const handler = {
      getType: (): CacheArtifactEnum => CacheArtifactEnum.IMAGE,
    };

    registry.registerHandler(handler as never);

    expect(registry.getHandler(CacheArtifactEnum.IMAGE)).to.equal(handler);
  });

  it('should throw when handler is not registered', (): void => {
    const registry: DefaultCacheHandlerRegistry = new DefaultCacheHandlerRegistry();

    expect(() => registry.getHandler(CacheArtifactEnum.IMAGE)).to.throw('No handler registered for type: images');
  });

  it('should return all registered handlers', (): void => {
    const registry: DefaultCacheHandlerRegistry = new DefaultCacheHandlerRegistry();
    const imageHandler = {getType: (): CacheArtifactEnum => CacheArtifactEnum.IMAGE};
    const chartHandler = {getType: (): CacheArtifactEnum => CacheArtifactEnum.HELM_CHART};

    registry.registerHandler(imageHandler as never);
    registry.registerHandler(chartHandler as never);

    expect(registry.getAllHandlers()).to.deep.equal([imageHandler, chartHandler]);
  });

  it('should replace handler for same type', (): void => {
    const registry: DefaultCacheHandlerRegistry = new DefaultCacheHandlerRegistry();
    const handler1 = {getType: (): CacheArtifactEnum => CacheArtifactEnum.IMAGE};
    const handler2 = {getType: (): CacheArtifactEnum => CacheArtifactEnum.IMAGE};

    registry.registerHandler(handler1 as never);
    registry.registerHandler(handler2 as never);

    expect(registry.getHandler(CacheArtifactEnum.IMAGE)).to.equal(handler2);
    expect(registry.getAllHandlers()).to.deep.equal([handler2]);
  });
});
