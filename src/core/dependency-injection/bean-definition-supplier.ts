// SPDX-License-Identifier: Apache-2.0

import {type DependencyContainer} from 'tsyringe-neo';

export interface BeanDefinitionSupplier {
  /**
   * The unique identifier for the bean.
   */
  readonly token: symbol;

  /**
   * Injects the bean definition into the provided dependency container.
   *
   * @param container - The dependency container where the bean definition should be registered.
   */
  register(container: DependencyContainer): void;
}
