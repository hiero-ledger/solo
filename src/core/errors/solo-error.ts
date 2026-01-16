// SPDX-License-Identifier: Apache-2.0

export class SoloError extends Error {
  public readonly statusCode?: number;
  /**
   * Create a custom error object
   *
   * error metadata will include the `cause`
   *
   * @param message error message
   * @param cause source error (if any)
   * @param meta additional metadata (if any)
   */
  public constructor(
    public override message: string,
    public override cause: Error | any = {},
    public meta: any = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    // eslint-disable-next-line unicorn/no-useless-error-capture-stack-trace
    Error.captureStackTrace(this, this.constructor);
    if (cause && Object.keys(cause).length > 0) {
      // if the cause message is the same as this message and this is a SoloError, re-throw the cause to avoid redundant wrapping
      if (message === cause.message && this.name === SoloError.name) {
        throw cause;
      }
      this.cause = cause;
      this.statusCode = this.cause.statusCode ?? this.cause.code;
      delete this.cause.headers; // remove headers to avoid leaking sensitive info
      if (this.cause instanceof Error) {
        this.stack += `\nCaused by: ${(this.cause as Error).stack}`;
      }
    }
  }
}
