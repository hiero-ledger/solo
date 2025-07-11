#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import sourceMapSupport from 'source-map-support';
sourceMapSupport.install(); // Enable source maps for error stack traces
import * as fnm from './src/index.js';
import {type SoloLogger} from './src/core/logging/solo-logger.js';
import {InjectTokens} from './src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type ErrorHandler} from './src/core/error-handler.js';
import * as wtf from 'wtfnode';

const context: {logger: SoloLogger} = {logger: undefined};
await fnm
  .main(process.argv, context)
  .then((): void => {
    wtf.setLogger('info', (message: string): void => {
      context.logger.info(message);
    });
    wtf.setLogger('warn', (message: string): void => {
      context.logger.warn(message);
    });
    wtf.setLogger('error', (message: string): void => {
      context.logger.error(message);
    });
    context.logger.info('Solo CLI completed, via entrypoint');
    wtf.dump(); // Dump the active handles and requests
  })
  .catch((error): void => {
    const errorHandler: ErrorHandler = container.resolve(InjectTokens.ErrorHandler);
    errorHandler.handle(error);
  });
