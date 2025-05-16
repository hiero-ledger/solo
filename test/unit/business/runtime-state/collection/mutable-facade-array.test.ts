// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {type FacadeArray} from '../../../../../src/business/runtime-state/collection/facade-array.js';
import {MutableFacadeArray} from '../../../../../src/business/runtime-state/collection/mutable-facade-array.js';
import {StringFacade} from '../../../../../src/business/runtime-state/facade/string-facade.js';
import {type ClassConstructor} from '../../../../../src/business/utils/class-constructor.type.js';

describe('MutableFacadeArray', (): void => {
  let myArray: FacadeArray<StringFacade, string>;
  // returns a StringConstructor

  beforeEach((): void => {
    myArray = new MutableFacadeArray<StringFacade, string>(
      StringFacade,
      ((stringValue: string): string => stringValue) as unknown as ClassConstructor<string>,
      [],
    );
  });

  it('should add a new element', (): void => {
    const stringFacade: StringFacade = new StringFacade('test');
    myArray.add(stringFacade);
    expect(myArray.length).to.equal(1);
    expect(myArray.get(0)).to.equal(stringFacade);
  });

  it('should addAll elements', (): void => {
    const stringFacade1: StringFacade = new StringFacade('test1');
    const stringFacade2: StringFacade = new StringFacade('test2');
    myArray.addAll(stringFacade1, stringFacade2);
    expect(myArray.length).to.equal(2);
    expect(myArray.get(0)).to.equal(stringFacade1);
    expect(myArray.get(1)).to.equal(stringFacade2);
  });

  it('set should update an element', (): void => {
    const stringFacade1: StringFacade = new StringFacade('test1');
    const stringFacade2: StringFacade = new StringFacade('test2');
    myArray.add(stringFacade1);
    myArray.set(0, stringFacade2);
    expect(myArray.get(0)).to.equal(stringFacade2);
  });

  it('indexOf should return the index of an element', (): void => {
    const stringFacade: StringFacade = new StringFacade('test');
    myArray.add(stringFacade);
    const index: number = myArray.indexOf(stringFacade);
    expect(index).to.equal(0);
  });

  it('some should return true if at least one element matches the predicate', (): void => {
    const stringFacade1: StringFacade = new StringFacade('test1');
    const stringFacade2: StringFacade = new StringFacade('test2');
    myArray.add(stringFacade1);
    myArray.add(stringFacade2);
    const result: boolean = myArray.some((value: StringFacade): boolean => value.toString() === 'test1');
    expect(result).to.be.true;
  });

  it('map should return an array of mapped values', (): void => {
    const stringFacade1: StringFacade = new StringFacade('test1');
    const stringFacade2: StringFacade = new StringFacade('test2');
    myArray.add(stringFacade1);
    myArray.add(stringFacade2);
    const result: string[] = myArray.map((value: StringFacade): string => value.toString());
    expect(result).to.deep.equal(['test1', 'test2']);
  });

  it('remove should remove an element', (): void => {
    const stringFacade: StringFacade = new StringFacade('test');
    myArray.add(stringFacade);
    myArray.remove(stringFacade);
    expect(myArray.length).to.equal(0);
  });

  it('includes should return true if the element is in the array', (): void => {
    const stringFacade: StringFacade = new StringFacade('test');
    myArray.add(stringFacade);
    const result: boolean = myArray.includes(stringFacade);
    expect(result).to.be.true;
  });

  it('clear should remove all elements', (): void => {
    const stringFacade1: StringFacade = new StringFacade('test1');
    const stringFacade2: StringFacade = new StringFacade('test2');
    myArray.add(stringFacade1);
    myArray.add(stringFacade2);
    myArray.clear();
    expect(myArray.length).to.equal(0);
  });

  it('should iterate over elements', (): void => {
    const stringFacade1: StringFacade = new StringFacade('test1');
    const stringFacade2: StringFacade = new StringFacade('test2');
    myArray.add(stringFacade1);
    myArray.add(stringFacade2);

    const result: StringFacade[] = [];
    for (const element of myArray) {
      result.push(element);
    }

    expect(result).to.deep.equal([stringFacade1, stringFacade2]);
  });
});
