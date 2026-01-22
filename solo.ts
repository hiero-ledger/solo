#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import sourceMapSupport from 'source-map-support';
sourceMapSupport.install(); // Enable source maps for error stack traces
import {inspect} from 'node:util';
import {createHook, type AsyncHook} from 'node:async_hooks';
import * as fnm from './src/index.js';
import {type SoloLogger} from './src/core/logging/solo-logger.js';
import {InjectTokens} from './src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type ErrorHandler} from './src/core/error-handler.js';

const context: {logger: SoloLogger} = {logger: undefined};

const asyncHandleStacks: Map<number, string> = new Map();
const asyncHook: AsyncHook = createHook({
  init(asyncId, type): void {
    if (type === 'MESSAGEPORT' || type === 'CHILD_PROCESS') {
      asyncHandleStacks.set(asyncId, `${type}\n${new Error().stack ?? ''}`);
    }
  },
});
asyncHook.enable();

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
      pid: typeof value?.pid === 'number' ? value.pid : undefined,
      exitCode: value?.exitCode ?? undefined,
      signalCode: value?.signalCode ?? undefined,
      remoteAddress:
        typeof (value?._peername as { address?: unknown } | undefined)?.address === 'string'
          ? (value?._peername as { address: string }).address
          : undefined,
      remotePort:
        typeof (value?._peername as { port?: unknown } | undefined)?.port === 'number'
          ? (value?._peername as { port: number }).port
          : undefined,
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
    .filter((entry) => entry.summary.type === 'MessagePort' || entry.summary.type === 'ChildProcess' || entry.summary.type === 'TLSSocket');

  if (logger) {
    logger.showUser(`Active handles/requests: ${JSON.stringify(payload)}`);
    if (detailedHandles.length > 0) {
      logger.showUser(`Active MessagePort details: ${JSON.stringify(detailedHandles)}`);
    }
    if (asyncHandleStacks.size > 0) {
      logger.showUser(`Async handle init stacks: ${JSON.stringify(Array.from(asyncHandleStacks.values()))}`);
    }
  } else {
    // Fallback for early failures before logger initialization.
    // eslint-disable-next-line no-console
    console.warn(`Active handles/requests: ${JSON.stringify(payload)}`);
    if (detailedHandles.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`Active MessagePort details: ${JSON.stringify(detailedHandles)}`);
    }
    if (asyncHandleStacks.size > 0) {
      // eslint-disable-next-line no-console
      console.warn(`Async handle init stacks: ${JSON.stringify(Array.from(asyncHandleStacks.values()))}`);
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
