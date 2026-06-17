// SPDX-License-Identifier: Apache-2.0

import {CacheError} from './cache-error.js';

export class CacheHandlerNotRegisteredError extends CacheError {
  public readonly type: string;

  public constructor(type: string) {
    super(`No handler registered for type: ${type}`, undefined, {type});
    this.type = type;
  }
}
