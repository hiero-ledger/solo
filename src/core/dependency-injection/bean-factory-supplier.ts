// SPDX-License-Identifier: Apache-2.0

import {type BeanDefintionSupplier} from './bean-defintion-supplier.js';
import {type DependencyContainer} from 'tsyringe-neo';

export class BeanFactorySupplier<T> implements BeanDefintionSupplier {
  private cachedInstance: T;

  public constructor(
    public readonly token: symbol,
    public readonly factory: (container: DependencyContainer) => T,
    public readonly singleton: boolean = true,
  ) {}

  public register(container: DependencyContainer): void {
    container.register(this.token, {
      useFactory: (c: DependencyContainer): T => {
        if (this.singleton && !this.cachedInstance) {
          this.cachedInstance = this.factory(c);
        }

        return this.cachedInstance ?? this.factory(c);
      },
    });
  }
}
