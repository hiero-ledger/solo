// SPDX-License-Identifier: Apache-2.0

import {CacheError} from './cache-error.js';

export class CacheInvalidKindNodeImageError extends CacheError {
  public readonly image: string;

  public constructor(image: string) {
    super(`Invalid Kind node image reference: ${image}`, undefined, {image});
    this.image = image;
  }
}
