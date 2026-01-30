#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import sourceMapSupport from 'source-map-support';
sourceMapSupport.install(); // Enable source maps for error stack traces
import * as fnm from './src/index.js';
import {type SoloLogger} from './src/core/logging/solo-logger.js';
import {InjectTokens} from './src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type ErrorHandler} from './src/core/error-handler.js';

const context: { logger?: SoloLogger } = {};

await fnm
  .main(process.argv, context)
  .then((): void => {
    context.logger?.info('Solo CLI completed, via entrypoint');
  })
  .catch((error): void => {
    const errorHandler: ErrorHandler = container.resolve(InjectTokens.ErrorHandler);
    errorHandler.handle(error);
  });
// Exit with the proper exit code and force close any open handles that prevent Solo from exiting
// eslint-disable-next-line n/no-process-exit
process.exit(process.exitCode ?? 0);
