// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {UserBreak} from './errors/user-break.js';
import {SilentBreak} from './errors/silent-break.js';
import {type NodeCommandHandlers} from '../commands/node/handlers.js';

@injectable()
export class ErrorHandler {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.NodeCommandHandlers) private readonly nodeCommandHandlers: NodeCommandHandlers,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.nodeCommandHandlers = patchInject(
      nodeCommandHandlers,
      InjectTokens.NodeCommandHandlers,
      this.constructor.name,
    );
  }

  public handle(error: unknown): void {
    const error_: UserBreak | SilentBreak | false = this.extractBreak(error);
    if (error_ instanceof UserBreak) {
      this.handleUserBreak(error_);
    } else if (error_ instanceof SilentBreak) {
      this.handleSilentBreak(error_);
    } else {
      this.handleError(error);
      process.exitCode = 1;
    }
  }

  private handleUserBreak(userBreak: UserBreak): void {
    this.logger.showUser(userBreak.message);
  }

  private handleSilentBreak(silentBreak: SilentBreak): void {
    this.logger.info(silentBreak.message);
  }

  private handleError(error: unknown): void {
    this.logger.showUserError(error);
    this.nodeCommandHandlers.logs({_: []}).catch((logsError: unknown): void => {
      this.logger.debug('Failed to collect diagnostic logs after error', {error: logsError});
    });
  }

  /**
   * Recursively checks if an error is or is caused by a UserBreak
   * Returns the UserBreak or SilentBreak if found, otherwise false
   * @param err
   */
  private extractBreak(error: unknown): UserBreak | SilentBreak | false {
    if (error instanceof UserBreak || error instanceof SilentBreak) {
      return error;
    }
    if (error instanceof Error && error.cause) {
      return this.extractBreak(error.cause);
    }
    return false;
  }
}
