// SPDX-License-Identifier: Apache-2.0

export class CacheError extends Error {
  public override readonly cause: Error | unknown;
  public readonly meta: object | undefined;

  public constructor(message: string, cause?: Error | unknown, meta?: object) {
    super(message);
    this.name = this.constructor.name;
    // eslint-disable-next-line unicorn/no-useless-error-capture-stack-trace
    Error.captureStackTrace(this, this.constructor);
    this.cause = cause;
    this.meta = meta;
  }
}
