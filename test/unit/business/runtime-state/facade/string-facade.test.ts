// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {StringFacade} from '../../../../../src/business/runtime-state/facade/string-facade.js';

describe('StringFacade', (): void => {
  it('should create a StringFacade instance', (): void => {
    const string_: string = 'Hello, world!';
    const facade: StringFacade = new StringFacade(string_);
    expect(facade.backingObject).to.equal(string_);
  });

  it('should compare two StringFacade instances', (): void => {
    const string1: string = 'Hello, world!';
    const string2: string = 'Hello, world!';
    const facade1: StringFacade = new StringFacade(string1);
    const facade2: StringFacade = new StringFacade(string2);
    expect(facade1.equals(facade2)).to.equal(true);
  });

  it('should not compare different StringFacade instances', (): void => {
    const string1: string = 'Hello, world!';
    const string2: string = 'Goodbye, world!';
    const facade1: StringFacade = new StringFacade(string1);
    const facade2: StringFacade = new StringFacade(string2);
    expect(facade1.equals(facade2)).to.equal(false);
  });

  it('should return the string representation of the backing object', (): void => {
    const string_: string = 'Hello, world!';
    const facade: StringFacade = new StringFacade(string_);
    expect(facade.toString()).to.equal(string_);
  });

  it('should return false when comparing with null', (): void => {
    const string_: string = 'Hello, world!';
    const facade: StringFacade = new StringFacade(string_);
    // eslint-disable-next-line unicorn/no-null
    expect(facade.equals(null)).to.equal(false);
  });

  it('should return true if the same instance is compared', (): void => {
    const string_: string = 'Hello, world!';
    const facade: StringFacade = new StringFacade(string_);
    expect(facade.equals(facade)).to.equal(true);
  });
});
