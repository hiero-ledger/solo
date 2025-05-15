// SPDX-License-Identifier: Apache-2.0

import {type Facade} from './facade.js';

export type FacadeObjectConstructor<T extends Facade<B>, B> = {
  new (instance: B): T;
};
