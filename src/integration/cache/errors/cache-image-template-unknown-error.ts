// SPDX-License-Identifier: Apache-2.0

import {CacheError} from './cache-error.js';

export class CacheImageTemplateUnknownError extends CacheError {
  public readonly key: string;

  public constructor(key: string) {
    super(`Unknown cache image template key: ${key}`, undefined, {key});
    this.key = key;
  }
}
