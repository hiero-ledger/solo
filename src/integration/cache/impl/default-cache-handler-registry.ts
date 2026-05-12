// SPDX-License-Identifier: Apache-2.0

import {type CacheHandlerRegistry} from '../api/cache-handler-registry.js';
import {type CacheOperationHandler} from '../api/cache-operation-handler.js';
import {type CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {injectable} from 'tsyringe-neo';

@injectable()
export class DefaultCacheHandlerRegistry implements CacheHandlerRegistry {
  private readonly handlers: Map<CacheArtifactEnum, CacheOperationHandler> = new Map();

  public getHandler(type: CacheArtifactEnum): CacheOperationHandler {
    const handler: CacheOperationHandler | undefined = this.handlers.get(type);

    if (!handler) {
      throw new Error(`No handler registered for type: ${type}`);
    }

    return handler;
  }

  public getAllHandlers(): readonly CacheOperationHandler[] {
    return [...this.handlers.values()];
  }

  public registerHandler(handler: CacheOperationHandler): void {
    this.handlers.set(handler.getType(), handler);
  }
}
