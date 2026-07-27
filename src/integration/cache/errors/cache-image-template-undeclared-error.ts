// SPDX-License-Identifier: Apache-2.0

import {CacheError} from './cache-error.js';

export class CacheImageTemplateUndeclaredError extends CacheError {
  public readonly template: string;

  public constructor(template: string) {
    super(
      `Undeclared cache image template key used in version field: ${template}. Add it to templates first.`,
      undefined,
      {template},
    );
    this.template = template;
  }
}
