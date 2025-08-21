// SPDX-License-Identifier: Apache-2.0

import {type AccountManager} from '../../core/account-manager.js';
import {BaseCommand} from './../base.js';
import {type NodeCommandHandlers} from './handlers.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';

/**
 * Defines the core functionalities of 'node' command
 */
@injectable()
export class NodeCommand extends BaseCommand {
  public constructor(
    @inject(InjectTokens.AccountManager) private readonly accountManager?: AccountManager,
    @inject(InjectTokens.NodeCommandHandlers) public readonly handlers?: NodeCommandHandlers,
  ) {
    super();

    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.handlers = patchInject(handlers, InjectTokens.NodeCommandHandlers, this.constructor.name);
  }

  /**
   * stops and closes the port forwards
   * - calls the accountManager.close()
   * - for all portForwards, calls k8Factory.default().pods().readByReference(null).stopPortForward(srv)
   */
  public async close(): Promise<void> {
    await this.accountManager.close();
  }

  public getUnusedConfigs(configName: string): string[] {
    return this.handlers.getUnusedConfigs(configName);
  }
}
