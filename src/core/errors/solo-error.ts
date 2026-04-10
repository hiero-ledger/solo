// SPDX-License-Identifier: Apache-2.0

import {type ErrorContext} from './error-context.js';
import {type ErrorRegistryEntry} from './error-registry-entry.js';
import {type SoloErrorCode} from './solo-error-code.js';
import {ErrorRegistry} from './error-registry.js';

export class SoloError extends Error {
  public readonly statusCode?: number;
  public readonly errorCode?: SoloErrorCode;
  public readonly context?: ErrorContext;

  /**
   * Create a custom error object
   *
   * error metadata will include the `cause`
   *
   * @param message error message
   * @param cause source error (if any)
   * @param meta additional metadata (if any)
   * @param options optional structured fields (errorCode, context)
   */
  public constructor(
    public override message: string,
    public override cause: Error | any = {},
    public meta: any = {},
    options?: {errorCode?: SoloErrorCode; context?: ErrorContext},
  ) {
    super(message);
    this.name = this.constructor.name;
    // eslint-disable-next-line unicorn/no-useless-error-capture-stack-trace
    Error.captureStackTrace(this, this.constructor);
    this.errorCode = options?.errorCode;
    this.context = options?.context;
    if (cause && Object.keys(cause).length > 0) {
      // if the cause message is the same as this message and this is a SoloError, re-throw the cause to avoid redundant wrapping
      if (
        message?.toString().trim() === cause.message?.toString().trim() &&
        this.name.toString().trim() === cause.name?.toString().trim()
      ) {
        throw cause;
      }
      this.cause = cause;
      this.statusCode = this.cause.statusCode ?? this.cause.code;
      delete this.cause.headers; // remove headers to avoid leaking sensitive info
    }
  }

  /**
   * Creates a SoloError from the error registry. The message is derived from
   * the registry entry's messageTemplate with context values interpolated.
   *
   * @param code - the SoloErrorCode to look up in the registry
   * @param context - key-value pairs to interpolate into the message template
   * @param cause - optional underlying error
   */
  public static withCode(code: SoloErrorCode, context?: ErrorContext, cause?: Error): SoloError {
    const entry: ErrorRegistryEntry | undefined = ErrorRegistry.get(code);
    const message: string = entry
      ? ErrorRegistry.interpolate(entry.messageTemplate, context ?? {})
      : ErrorRegistry.formatCode(code);
    return new SoloError(message, cause ?? {}, {}, {errorCode: code, context});
  }
}
