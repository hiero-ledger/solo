// SPDX-License-Identifier: Apache-2.0

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';

const CACHE_MAX_AGE_MS: number = 7 * 24 * 60 * 60 * 1000;
const CACHE_FILE_PATH: string = path.join(homedir(), '.solo', 'kanban-cache.json');

interface CacheEntry {
  etag: string | undefined;
  linkHeader: string | undefined;
  data: unknown;
  cachedAt: number;
}

type CacheStore = Record<string, CacheEntry>;

export class GithubCache {
  private readonly entries: Map<string, CacheEntry>;
  private readonly filePath: string;
  private dirty: boolean = false;
  public hits: number = 0;

  private constructor(filePath: string, entries: Map<string, CacheEntry>) {
    this.filePath = filePath;
    this.entries = entries;
  }

  public static load(): GithubCache {
    let entries: Map<string, CacheEntry> = new Map<string, CacheEntry>();
    try {
      const raw: string = readFileSync(CACHE_FILE_PATH, 'utf8');
      const store: CacheStore = JSON.parse(raw) as CacheStore;
      entries = new Map<string, CacheEntry>(Object.entries(store));
    } catch {
      // best-effort: start with an empty cache when the file is absent or unparseable
    }
    const cache: GithubCache = new GithubCache(CACHE_FILE_PATH, entries);
    cache.prune();
    return cache;
  }

  public get(url: string): {etag: string | undefined; data: unknown; linkHeader: string | undefined} | undefined {
    const entry: CacheEntry | undefined = this.entries.get(url);
    if (!entry) {
      return undefined;
    }
    return {etag: entry.etag, data: entry.data, linkHeader: entry.linkHeader};
  }

  public set(url: string, etag: string | undefined, linkHeader: string | undefined, data: unknown): void {
    this.entries.set(url, {etag, linkHeader, data, cachedAt: Date.now()});
    this.dirty = true;
  }

  public recordHit(): void {
    this.hits++;
  }

  public save(): void {
    if (!this.dirty) {
      return;
    }
    const store: CacheStore = Object.fromEntries(this.entries);
    mkdirSync(path.dirname(this.filePath), {recursive: true});
    writeFileSync(this.filePath, JSON.stringify(store, undefined, 2), 'utf8');
    this.dirty = false;
  }

  private prune(): void {
    const cutoff: number = Date.now() - CACHE_MAX_AGE_MS;
    for (const [url, entry] of this.entries) {
      if (entry.cachedAt < cutoff) {
        this.entries.delete(url);
        this.dirty = true;
      }
    }
  }
}
