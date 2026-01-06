// SPDX-License-Identifier: Apache-2.0

import {type KeyFormatter} from './key-formatter.js';
import {IllegalArgumentError} from '../../business/errors/illegal-argument-error.js';
import {StringEx} from '../../business/utils/string-ex.js';

export class ConfigKeyFormatter implements KeyFormatter {
  private static _instance: ConfigKeyFormatter;

  public readonly separator: string = StringEx.PERIOD;

  private constructor() {}

  public normalize(key: string): string {
    if (StringEx.isEmpty(key)) {
      return key;
    }

    key = key.trim();

    if (!StringEx.isUnderscored(key)) {
      // This check is necessary to properly handle environment variables and prefixes.
      // Without this check and conversion, keys and prefixes like "ENV" are converted to "eNV" which is not desired.
      if (StringEx.isUppercase(key)) {
        key = key.toLowerCase();
      }

      return StringEx.verbCase(key);
    }

    return StringEx.snakeToDotCase(key);
  }

  public split(key: string): string[] {
    if (!key || key.trim().length === 0) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    return key.split(this.separator);
  }

  public join(...parts: string[]): string {
    if (!parts || parts.length === 0) {
      return null;
    }

    return parts.join(this.separator);
  }

  public static instance(): KeyFormatter {
    if (!ConfigKeyFormatter._instance) {
      ConfigKeyFormatter._instance = new ConfigKeyFormatter();
    }

    return ConfigKeyFormatter._instance;
  }
}
