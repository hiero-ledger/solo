// SPDX-License-Identifier: Apache-2.0

import {type FacadeMap} from './facade-map.js';
import {type Facade} from '../facade/facade.js';
import {type FacadeObjectConstructor} from '../facade/facade-object-constructor.js';
import {type ClassConstructor} from '../../utils/class-constructor.type.js';

export class MutableFacadeMap<K, V extends Facade<BV>, BV> implements FacadeMap<K, V, BV> {
  private readonly facadeMap: Map<K, V>;

  public constructor(
    private readonly facadeObjectConstructor: FacadeObjectConstructor<V, BV>,
    private readonly encapsulatedObjectConstructor: ClassConstructor<BV>,
    private readonly encapsulatedMap: Map<K, BV>,
  ) {
    this.facadeMap = new Map<K, V>();

    for (const [key, encapsulatedObject] of encapsulatedMap.entries()) {
      const facadeObject: V = new this.facadeObjectConstructor(encapsulatedObject);
      this.facadeMap.set(key, facadeObject);
    }
  }

  public addNew(key: K): V {
    const encapsulatedObject: BV = new this.encapsulatedObjectConstructor();
    const facadeObject: V = new this.facadeObjectConstructor(encapsulatedObject);
    this.facadeMap.set(key, facadeObject);
    this.encapsulatedMap.set(key, encapsulatedObject);

    return facadeObject;
  }

  public get(key: K): V | undefined {
    return this.facadeMap.get(key);
  }

  public set(key: K, value: V): void {
    const encapsulatedObject: BV = value.encapsulatedObject;
    this.facadeMap.set(key, value);
    this.encapsulatedMap.set(key, encapsulatedObject);
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
    this.encapsulatedMap.delete(key);

    return removed;
  }

  public clear(): void {
    this.facadeMap.clear();
    this.encapsulatedMap.clear();
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
    return 'MutableFacadeMap';
  }
}
