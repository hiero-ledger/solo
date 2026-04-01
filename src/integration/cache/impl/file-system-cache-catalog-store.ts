// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import {type CacheCatalogStore} from '../api/cache-catalog-store.js';
import {PathEx} from '../../../business/utils/path-ex.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {type CacheCatalog} from '../models/impl/cache-catalog.js';
import {type CacheTarget} from '../models/impl/cache-target.js';

@injectable()
export class FileSystemCacheCatalogStore implements CacheCatalogStore {
  private readonly catalogFileName: string = 'cache-catalog.json';
  private readonly baseDirectory: string;

  public constructor(@inject(InjectTokens.HomeDirectory) private readonly basePath: string) {
    this.basePath = patchInject(basePath, InjectTokens.HomeDirectory, this.constructor.name);
    this.baseDirectory = PathEx.join(this.basePath, 'cache');
  }

  public async save(catalog: CacheCatalog): Promise<void> {
    const path: string = this.getCatalogPath();

    await fs.mkdir(this.baseDirectory, {recursive: true});
    await fs.writeFile(path, JSON.stringify(catalog, undefined, 2));
  }

  public async load(): Promise<CacheCatalog> {
    const path: string = this.getCatalogPath();

    const raw: string = await fs.readFile(path, 'utf8');

    return JSON.parse(raw) as CacheCatalog;
  }

  public async exists(): Promise<boolean> {
    const path: string = this.getCatalogPath();

    return fs
      .access(path)
      .then((): boolean => true)
      .catch((): boolean => false);
  }

  public async clear(): Promise<void> {
    await fs.rm(this.baseDirectory, {recursive: true, force: true});
  }

  public resolvePath(target: CacheTarget): string {
    const safeName: string = `${target.name}__${target.version}`.replaceAll('/', '__').replaceAll(':', '__');

    return PathEx.join(this.baseDirectory, `${safeName}.tar`);
  }

  private getCatalogPath(): string {
    return PathEx.join(this.baseDirectory, this.catalogFileName);
  }
}
