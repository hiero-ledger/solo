// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../core/errors/solo-error.js';
import {type CacheImageTemplateResolver} from '../api/cache-image-template-resolver.js';
import {type CacheImageTemplateValuesStructure} from '../models/cache-image-template-values-structure.js';

type TemplateKey = keyof CacheImageTemplateValuesStructure;

export class DefaultCacheImageTemplateResolver implements CacheImageTemplateResolver {
  public constructor(private readonly templateValues: CacheImageTemplateValuesStructure) {}

  public has(key: string): boolean {
    return key in this.templateValues;
  }

  public resolve(key: string): string {
    if (!this.has(key)) {
      throw new SoloError(`Unknown cache image template key: ${key}`);
    }

    return this.templateValues[key as TemplateKey];
  }
}
