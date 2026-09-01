// SPDX-License-Identifier: Apache-2.0

import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type ErrorHandler} from './error-handler.js';
import {type SoloLogger} from './logging/solo-logger.js';

export class CliBootstrap {
  /**
   * Shared entrypoint tail: runs `main`, routes any thrown error through the DI ErrorHandler
   * (formatted output, doc links, diagnostics tip, error translators), flushes the logger, and
   * exits with the correct code. Used by both solo.ts (npm/dev entry) and the SEA bootstrap
   * (sea/sea-main.template.cjs) so the two entry points can't drift apart.
   */
  public static async run(
    argv: string[],
    main: (argv: string[], context?: {logger: SoloLogger}) => Promise<unknown>,
  ): Promise<void> {
    const context: {logger: SoloLogger} = {logger: undefined};

    await main(argv, context)
      .then((): void => {
        context.logger?.info('Solo CLI completed, via entrypoint');
      })
      .catch((error: unknown): void => {
        const errorHandler: ErrorHandler = container.resolve(InjectTokens.ErrorHandler);
        errorHandler.handle(error);
      });

    if (context.logger) {
      // eslint-disable-next-line unicorn/no-process-exit, n/no-process-exit
      context.logger.flush((): void => process.exit(process.exitCode ?? 0));
    } else {
      // eslint-disable-next-line unicorn/no-process-exit, n/no-process-exit
      process.exit(process.exitCode ?? 0);
    }
  }
}
