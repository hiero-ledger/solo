// SPDX-License-Identifier: Apache-2.0

import {BaseCommand} from './../base.js';
import {type ClusterCommandHandlers} from './handlers.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';

/**
 * Defines the core functionalities of 'node' command
 */
@injectable()
export class ClusterCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.ClusterCommandHandlers) public readonly handlers?: ClusterCommandHandlers) {
    super();

    this.handlers = patchInject(handlers, InjectTokens.ClusterCommandHandlers, this.constructor.name);
  }

  public close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
