// SPDX-License-Identifier: Apache-2.0

import {type Facade} from './facade.js';

export class StringFacade implements Facade<string> {
  public constructor(public readonly backingObject: string) {}

  public equals(other: StringFacade): boolean {
    if (this === other) {
      return true;
    }

    if (!other) {
      return false;
    }

    return this.backingObject === other.backingObject;
  }

  public toString(): string {
    return this.backingObject;
  }
}
