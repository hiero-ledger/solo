// SPDX-License-Identifier: Apache-2.0

import {Lifecycle} from 'tsyringe-neo';

export class SingletonContainer {
  public lifecycle: Lifecycle;

  public constructor(
    public token: symbol,
    public useClass: any,
  ) {
    this.lifecycle = Lifecycle.Singleton;
  }
}
