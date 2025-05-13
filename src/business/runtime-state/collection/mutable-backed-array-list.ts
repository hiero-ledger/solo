// SPDX-License-Identifier: Apache-2.0

import {type ClassConstructor} from '../../utils/class-constructor.type.js';
import {type Facade} from '../facade/facade.js';
import {type BackedArrayList} from './backed-array-list.js';
import {type FacadeObjectConstructor} from '../facade/facade-object-constructor.js';

export class MutableBackedArrayList<T extends Facade<B>, B> implements BackedArrayList<T, B> {
  private readonly facadeArray: T[];

  public constructor(
    private readonly facadeObjectCtor: FacadeObjectConstructor<T, B>,
    private readonly backingObjectCtor: ClassConstructor<B>,
    private readonly backingArray: B[],
  ) {
    this.facadeArray = [];

    for (const backingObject of backingArray) {
      const facadeObject: T = new this.facadeObjectCtor(backingObject);
      this.facadeArray.push(facadeObject);
    }
  }

  public get length(): number {
    return this.facadeArray.length;
  }

  public add(value: T): void {
    const backingObject: B = value.backingObject;
    this.facadeArray.push(value);
    this.backingArray.push(backingObject);
  }

  public addNew(): T {
    const backingObject: B = new this.backingObjectCtor();
    const facadeObject: T = new this.facadeObjectCtor(backingObject);
    this.add(facadeObject);

    return facadeObject;
  }

  public addAll(...values: T[]): void {
    for (const value of values) {
      this.add(value);
    }
  }

  public get(index: number): T {
    return this.facadeArray[index];
  }

  public set(index: number, value: T): void {
    this.facadeArray[index] = value;
    this.backingArray[index] = value.backingObject;
  }

  public indexOf(value: T): number {
    return this.facadeArray.indexOf(value);
  }

  public find(predicate: (value: T) => boolean): T | undefined {
    return this.facadeArray.find((element: T): boolean => predicate(element));
  }

  public includes(value: T): boolean {
    return this.facadeArray.includes(value);
  }

  public some(predicate: (value: T) => boolean): boolean {
    return this.facadeArray.some((element: T): boolean => predicate(element));
  }

  public map<U>(callback: (value: T) => U): U[] {
    return this.facadeArray.map((element: T): U => callback(element));
  }

  public remove(value: T): void {
    const facadeIndex: number = this.facadeArray.indexOf(value);

    if (facadeIndex !== -1) {
      this.facadeArray.splice(facadeIndex, 1);
    }

    const backingIndex: number = this.backingArray.indexOf(value.backingObject);

    if (backingIndex !== -1) {
      this.backingArray.splice(backingIndex, 1);
    }
  }

  public clear(): void {
    this.facadeArray.splice(0);
    this.backingArray.splice(0);
  }

  public *[Symbol.iterator](): IterableIterator<T> {
    for (const element of this.facadeArray) {
      yield element;
    }
  }
}
