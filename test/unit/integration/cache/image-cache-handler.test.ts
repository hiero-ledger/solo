// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import {describe, it} from 'mocha';
import {ImageCacheHandler} from '../../../../src/integration/cache/impl/image-cache-handler.js';
import {StaticCacheTargetProvider} from '../../../../src/integration/cache/target-providers/static-cache-target-provider.js';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';
import {type CacheCatalogStore} from '../../../../src/integration/cache/api/cache-catalog-store.js';
import {type CacheHealthInspector} from '../../../../src/integration/cache/api/cache-health-inspector.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type ContainerEngineClient} from '../../../../src/integration/container-engine/container-engine-client.js';
import {type SoloListrTask} from '../../../../src/types/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';

describe('ImageCacheHandler pull', (): void => {
  const target: {
    type: CacheArtifactEnum;
    name: string;
    version: string;
    source: string | undefined;
  } = {
    type: CacheArtifactEnum.IMAGE,
    name: 'docker.io/library/busybox',
    version: '1.36.1',
    source: undefined,
  };

  const store: CacheCatalogStore = {
    save: async (): Promise<void> => undefined,
    load: async (): Promise<never> => ({items: []}) as never,
    exists: async (): Promise<boolean> => true,
    clear: async (): Promise<void> => undefined,
    resolvePath: (): string => '/tmp/busybox.tar',
  };

  const inspector: CacheHealthInspector = {
    exists: async (): Promise<boolean> => false,
    getSize: async (): Promise<number> => 0,
    filterExisting: async (paths: readonly string[]): Promise<readonly string[]> => paths,
  };

  const logger: SoloLogger = {
    setDevMode: (): void => undefined,
    isDevMode: (): boolean => false,
    nextTraceId: (): void => undefined,
    setLogBinding: (): void => undefined,
    addLogBindings: (): void => undefined,
    clearLogBindings: (): void => undefined,
    prepMeta: (meta?: object): object => meta ?? {},
    showUser: (): void => undefined,
    showUserError: (): void => undefined,
    error: (): void => undefined,
    warn: (): void => undefined,
    info: (): void => undefined,
    debug: (): void => undefined,
    showList: (): void => undefined,
    showJSON: (): void => undefined,
    addMessageGroup: (): void => undefined,
    getMessageGroup: (): string[] => [],
    addMessageGroupMessage: (): void => undefined,
    showMessageGroup: (): void => undefined,
    getMessageGroupKeys: (): string[] => [],
    showAllMessageGroups: (): void => undefined,
    flush: (callback: (error?: Error) => void): void => callback(),
  };

  it('should throw when saveImage fails', async (): Promise<void> => {
    const saveImageStub: SinonStub = sinon.stub().rejects(new Error('rate limited'));
    const engine: ContainerEngineClient = {
      pullImage: async (): Promise<void> => undefined,
      saveImage: saveImageStub,
      loadImage: async (): Promise<void> => undefined,
      loadImageArchiveIntoCluster: async (): Promise<void> => undefined,
      removeImage: async (): Promise<void> => undefined,
      listLoadedImagesInCluster: async (): Promise<readonly string[]> => [],
    };

    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([target]);
    const handler: ImageCacheHandler = new ImageCacheHandler(engine, provider, store, inspector, logger);

    const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
    const context: {config: {results: unknown[]}} = {config: {results: []}};

    await expect(subtasks[0].task(context as never, {title: 'task'} as never)).to.be.rejectedWith('rate limited');
    expect(context.config.results).to.have.lengthOf(0);
  });

  it('should register cached result when saveImage succeeds', async (): Promise<void> => {
    const engine: ContainerEngineClient = {
      pullImage: async (): Promise<void> => undefined,
      saveImage: async (): Promise<void> => undefined,
      loadImage: async (): Promise<void> => undefined,
      loadImageArchiveIntoCluster: async (): Promise<void> => undefined,
      removeImage: async (): Promise<void> => undefined,
      listLoadedImagesInCluster: async (): Promise<readonly string[]> => [],
    };

    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([target]);
    const handler: ImageCacheHandler = new ImageCacheHandler(engine, provider, store, inspector, logger);

    const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
    const context: {config: {results: unknown[]}} = {config: {results: []}};

    await subtasks[0].task(context as never, {title: 'task'} as never);

    expect(context.config.results).to.have.lengthOf(1);
  });
});
