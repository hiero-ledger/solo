// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import {type CacheHealthInspector} from '../api/cache-health-inspector.js';
import {type Stats} from 'node:fs';
import {injectable} from 'tsyringe-neo';

@injectable()
export class DefaultCacheHealthInspector implements CacheHealthInspector {
  public async exists(path: string): Promise<boolean> {
    return fs
      .access(path)
      .then((): boolean => true)
      .catch((): boolean => false);
  }

  public async getSize(path: string): Promise<number> {
    const stat: Stats = await fs.stat(path);
    return stat.size;
  }

  public async filterExisting(paths: readonly string[]): Promise<readonly string[]> {
    const result: string[] = [];

    for (const path of paths) {
      if (await this.exists(path)) {
        result.push(path);
      }
    }

    return result;
  }
}
