// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../facade/facade.js';

export interface BackedMap<K, V extends Facade<BV>, BV> {
  readonly size: number;

  addNew(key: K): V;

  get(key: K): V | undefined;

  set(key: K, value: V): void;

  delete(key: K): boolean;

  has(key: K): boolean;

  forEach(callback: (value: V, key: K, map: Map<K, V>) => void): void;

  entries(): IterableIterator<[K, V]>;

  keys(): IterableIterator<K>;

  values(): IterableIterator<V>;

  clear(): void;

  [Symbol.iterator](): MapIterator<[K, V]>;

  [Symbol.toStringTag](): string;
}
