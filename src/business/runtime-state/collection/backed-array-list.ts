// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../facade/facade.js';

export interface BackedArrayList<T extends Facade<B>, B> {
  readonly length: number;

  add(value: T): void;

  addNew(): T;

  addAll(...values: T[]): void;

  get(index: number): T;

  set(index: number, value: T): void;

  indexOf(value: T): number;

  find(predicate: (value: T) => boolean): T | undefined;

  includes(value: T): boolean;

  some(predicate: (value: T) => boolean): boolean;

  map<U>(callback: (value: T) => U): U[];

  remove(value: T): void;

  clear(): void;

  [Symbol.iterator](): IterableIterator<T>;
}
