// SPDX-License-Identifier: Apache-2.0

import {CacheError} from './cache-error.js';

export class CacheProviderNotConfiguredError extends CacheError {
  public readonly providerName: string;
  public readonly missing: 'provider' | 'engine';

  public constructor(providerName: string, missing: 'provider' | 'engine') {
    super(`${providerName}: cache ${missing} must be set before building`, undefined, {providerName, missing});
    this.providerName = providerName;
    this.missing = missing;
  }
}
