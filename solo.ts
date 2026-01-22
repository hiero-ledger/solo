#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import sourceMapSupport from 'source-map-support';
sourceMapSupport.install(); // Enable source maps for error stack traces
import {inspect} from 'node:util';
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
  const detailedHandles = handles
    .map((handle): {summary: Record<string, unknown>; details: string} => ({
      summary: describe(handle),
      details: inspect(handle, {depth: 2, showHidden: true, breakLength: 120}),
    }))
    .filter((entry) => entry.summary.type === 'MessagePort');

  if (logger) {
    logger.showUser(`Active handles/requests: ${JSON.stringify(payload)}`);
    if (detailedHandles.length > 0) {
      logger.showUser(`Active MessagePort details: ${JSON.stringify(detailedHandles)}`);
    }
  } else {
    // Fallback for early failures before logger initialization.
    // eslint-disable-next-line no-console
    console.warn(`Active handles/requests: ${JSON.stringify(payload)}`);
    if (detailedHandles.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`Active MessagePort details: ${JSON.stringify(detailedHandles)}`);
    }
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
