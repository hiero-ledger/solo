// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type TssSchema} from '../../../../data/schema/model/solo/tss-schema.js';
import {Wraps} from './wraps.js';

export class Tss implements Facade<TssSchema> {
  private readonly _wraps: Wraps;

  public constructor(public readonly encapsulatedObject: TssSchema) {
    this._wraps = new Wraps(encapsulatedObject.wraps);
  }

  public get messageSizeSoftLimitBytes(): number {
    return this.encapsulatedObject.messageSizeSoftLimitBytes;
  }

  public get messageSizeHardLimitBytes(): number {
    return this.encapsulatedObject.messageSizeHardLimitBytes;
  }

  public get timeoutAfterReadySeconds(): number {
    return this.encapsulatedObject.timeoutAfterReadySeconds;
  }

  public get readyMaxAttempts(): number {
    return this.encapsulatedObject.readyMaxAttempts;
  }

  public get readyBackoffSeconds(): number {
    return this.encapsulatedObject.readyBackoffSeconds;
  }

  public get wraps(): Wraps {
    return this._wraps;
  }
}
