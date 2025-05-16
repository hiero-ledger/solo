// SPDX-License-Identifier: Apache-2.0

import {type ClassConstructor} from '../../utils/class-constructor.type.js';
import {type Facade} from '../facade/facade.js';
import {type FacadeArray} from './facade-array.js';
import {type FacadeObjectConstructor} from '../facade/facade-object-constructor.js';

export class MutableFacadeArray<T extends Facade<B>, B> implements FacadeArray<T, B> {
  private readonly facadeArray: T[];

  public constructor(
    private readonly facadeObjectConstructor: FacadeObjectConstructor<T, B>,
    private readonly encapsulatedObjectConstructor: ClassConstructor<B>,
    private readonly encapsulatedArray: B[],
  ) {
    this.facadeArray = [];

    for (const encapsulatedObject of encapsulatedArray) {
      const facadeObject: T = new this.facadeObjectConstructor(encapsulatedObject);
      this.facadeArray.push(facadeObject);
    }
  }

  public get length(): number {
    return this.facadeArray.length;
  }

  public add(value: T): void {
    const encapsulatedObject: B = value.encapsulatedObject;
    this.facadeArray.push(value);
    this.encapsulatedArray.push(encapsulatedObject);
  }

  public addNew(): T {
    const encapsulatedObject: B = new this.encapsulatedObjectConstructor();
    const facadeObject: T = new this.facadeObjectConstructor(encapsulatedObject);
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
    this.encapsulatedArray[index] = value.encapsulatedObject;
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

    const encapsulatedIndex: number = this.encapsulatedArray.indexOf(value.encapsulatedObject);

    if (encapsulatedIndex !== -1) {
      this.encapsulatedArray.splice(encapsulatedIndex, 1);
    }
  }

  public clear(): void {
    this.facadeArray.splice(0);
    this.encapsulatedArray.splice(0);
  }

  public *[Symbol.iterator](): IterableIterator<T> {
    for (const element of this.facadeArray) {
      yield element;
    }
  }
}
