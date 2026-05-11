// SPDX-License-Identifier: Apache-2.0

import {type CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {type CacheOperationHandler} from './cache-operation-handler.js';

/**
 * Registry used to resolve the correct cache handler for a given artifact type.
 *
 * This avoids conditional branching in the coordinator and keeps handler
 * selection centralized.
 */
export interface CacheHandlerRegistry {
  /**
   * Returns the handler responsible for the given artifact type.
   *
   * @throws if no handler is registered for the provided type
   */
  getHandler(type: CacheArtifactEnum): CacheOperationHandler;

  /**
   * Returns all registered handlers.
   */
  getAllHandlers(): readonly CacheOperationHandler[];

  /**
   * Registers a new handler for the given artifact type.
   */
  registerHandler(handler: CacheOperationHandler): void;
}
