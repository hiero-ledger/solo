// SPDX-License-Identifier: Apache-2.0

export class KubeError extends Error {
  public override readonly cause: Error | unknown;
  public readonly meta: object | undefined;
  public readonly statusCode: number | string | undefined;

  public constructor(message: string, cause?: Error | unknown, meta?: object, statusCode?: number | string) {
    super(message);
    this.name = this.constructor.name;
    // eslint-disable-next-line unicorn/no-useless-error-capture-stack-trace
    Error.captureStackTrace(this, this.constructor);
    this.cause = cause;
    this.meta = meta;
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    } else if (cause && typeof cause === 'object') {
      const causeObject: Record<string, unknown> = cause as Record<string, unknown>;
      if ('headers' in causeObject) {
        delete causeObject.headers;
      }
      this.statusCode = (causeObject['statusCode'] ?? causeObject['code']) as number | string | undefined;
    }
  }
}
