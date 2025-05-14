// SPDX-License-Identifier: Apache-2.0

import {type BackedMap} from './backed-map.js';
import {type Facade} from '../facade/facade.js';
import {type FacadeObjectConstructor} from '../facade/facade-object-constructor.js';
import {type ClassConstructor} from '../../utils/class-constructor.type.js';

export class MutableBackedMap<K, V extends Facade<BV>, BV> implements BackedMap<K, V, BV> {
  private readonly facadeMap: Map<K, V>;

  public constructor(
    private readonly facadeObjectConstructor: FacadeObjectConstructor<V, BV>,
    private readonly backingObjectConstructor: ClassConstructor<BV>,
    private readonly backingMap: Map<K, BV>,
  ) {
    this.facadeMap = new Map<K, V>();

    for (const [key, backingObject] of backingMap.entries()) {
      const facadeObject: V = new this.facadeObjectConstructor(backingObject);
      this.facadeMap.set(key, facadeObject);
    }
  }

  public addNew(key: K): V {
    const backingObject: BV = new this.backingObjectConstructor();
    const facadeObject: V = new this.facadeObjectConstructor(backingObject);
    this.facadeMap.set(key, facadeObject);
    this.backingMap.set(key, backingObject);

    return facadeObject;
  }

  public get(key: K): V | undefined {
    return this.facadeMap.get(key);
  }

  public set(key: K, value: V): void {
    const backingObject: BV = value.encapsulatedObject;
    this.facadeMap.set(key, value);
    this.backingMap.set(key, backingObject);
  }

  public has(key: K): boolean {
    return this.facadeMap.has(key);
  }

  public forEach(callback: (value: V, key: K, map: Map<K, V>) => void): void {
    for (const [key, value] of this.facadeMap.entries()) {
      callback(value, key, this.facadeMap);
    }
  }

  public entries(): IterableIterator<[K, V]> {
    return this.facadeMap.entries();
  }

  public keys(): IterableIterator<K> {
    return this.facadeMap.keys();
  }

  public values(): IterableIterator<V> {
    return this.facadeMap.values();
  }

  public delete(key: K): boolean {
    const removed: boolean = this.facadeMap.delete(key);
    this.backingMap.delete(key);

    return removed;
  }

  public clear(): void {
    this.facadeMap.clear();
    this.backingMap.clear();
  }

  public get size(): number {
    return this.facadeMap.size;
  }

  public *[Symbol.iterator](): MapIterator<[K, V]> {
    for (const [key, value] of this.facadeMap.entries()) {
      yield [key, value];
    }
  }

  public [Symbol.toStringTag](): string {
    return 'MutableBackedMap';
  }
}
