// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {UserBreak} from './errors/user-break.js';
import {SilentBreak} from './errors/silent-break.js';
import {KubeErrorTranslator} from './errors/kube-error-translator.js';
import {CacheErrorTranslator} from './errors/cache-error-translator.js';
import {HelmErrorTranslator} from './errors/helm-error-translator.js';
import {SdkErrorTranslator} from './errors/sdk-error-translator.js';
import {SoloError} from './errors/solo-error.js';
import {ExitCode} from './exit-code.js';

@injectable()
export class ErrorHandler {
  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public handle(error: unknown): void {
    const error_: UserBreak | SilentBreak | false = this.extractBreak(error);
    if (error_ instanceof UserBreak) {
      this.handleUserBreak(error_);
    } else if (error_ instanceof SilentBreak) {
      this.handleSilentBreak(error_);
    } else {
      process.exitCode = ErrorHandler.resolveExitCode(this.handleError(error));
    }
  }

  /** Resolves the exit code from the root cause: the deepest coded SoloError in the cause chain. */
  private static resolveExitCode(error: unknown): ExitCode {
    let rootCause: SoloError | undefined;
    let current: unknown = error;
    while (current instanceof Error) {
      if (current instanceof SoloError && current.getFormattedCode()) {
        rootCause = current;
      }
      current = current.cause;
    }
    return rootCause?.isInvalidInput() ? ExitCode.INVALID_INPUT : ExitCode.FAILURE;
  }

  private handleUserBreak(userBreak: UserBreak): void {
    this.logger.showUser(userBreak.message);
  }

  private handleSilentBreak(silentBreak: SilentBreak): void {
    this.logger.info(silentBreak.message);
  }

  /** Shows the error to the user and returns it as shown, which is the translated error when a translator applies. */
  private handleError(error: unknown): unknown {
    const translated: unknown =
      KubeErrorTranslator.tryTranslate(error) ??
      CacheErrorTranslator.tryTranslate(error) ??
      HelmErrorTranslator.tryTranslate(error) ??
      SdkErrorTranslator.tryTranslate(error) ??
      error;
    this.logger.showUserError(translated);
    this.logger.showUser(
      '\n💡 Tip: To collect diagnostic information and help debug this issue, you can run:\n' +
        '   solo deployment diagnostics logs\n' +
        'Or to collect logs and create a GitHub issue in one step:\n' +
        '   solo deployment diagnostics report\n',
    );
    return translated;
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
