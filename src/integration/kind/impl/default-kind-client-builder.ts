// SPDX-License-Identifier: Apache-2.0

import {type KindClientBuilder} from '../kind-client-builder.js';
import {type KindClient} from '../kind-client.js';
import {DefaultKindClient} from './default-kind-client.js';

export class DefaultKindClientBuilder implements KindClientBuilder {
  constructor() {}

  build(): KindClient {
    return new DefaultKindClient();
  }
}
