// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type KindClient} from './kind-client.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';

@injectable()
export class DefaultKindClient implements KindClient {
  constructor(@inject(InjectTokens.SoloLogger) private readonly logger: any) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  // Implement other methods from KindClient interface here
}