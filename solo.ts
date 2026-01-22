#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import sourceMapSupport from 'source-map-support';
sourceMapSupport.install(); // Enable source maps for error stack traces
import * as fnm from './src/index.js';
import {type SoloLogger} from './src/core/logging/solo-logger.js';
import {InjectTokens} from './src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type ErrorHandler} from './src/core/error-handler.js';

const context: {logger: SoloLogger} = {logger: undefined};

const logActiveHandles = (logger: SoloLogger | undefined): void => {
  const handles = (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles?.() ?? [];
  const requests = (process as unknown as { _getActiveRequests?: () => unknown[] })._getActiveRequests?.() ?? [];
  const describe = (item: unknown): Record<string, unknown> => {
    const value = item as Record<string, unknown>;
    return {
      type: value?.constructor ? (value.constructor as { name?: string }).name : typeof value,
      fd: typeof value?.fd === 'number' ? value.fd : undefined,
      name: typeof value?.name === 'string' ? value.name : undefined,
      timeout: typeof value?._idleTimeout === 'number' ? value._idleTimeout : undefined,
    };
  };
  const payload = {
    activeHandles: handles.map(describe),
    activeRequests: requests.map(describe),
  };

  if (logger) {
    logger.warn(`Active handles/requests: ${JSON.stringify(payload)}`);
  } else {
    // Fallback for early failures before logger initialization.
    // eslint-disable-next-line no-console
    console.warn(`Active handles/requests: ${JSON.stringify(payload)}`);
  }
};

await fnm
  .main(process.argv, context)
  .then((): void => {
    context.logger.info('Solo CLI completed, via entrypoint');
    logActiveHandles(context.logger);
  })
  .catch((error): void => {
    const errorHandler: ErrorHandler = container.resolve(InjectTokens.ErrorHandler);
    errorHandler.handle(error);
    logActiveHandles(context.logger);
  });
