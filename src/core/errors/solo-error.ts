// SPDX-License-Identifier: Apache-2.0

import {type ErrorContext} from './error-context.js';
import {type ErrorRegistryEntry} from './error-registry-entry.js';
import {type SoloErrorCode} from './solo-error-code.js';
import {ErrorRegistry} from './error-registry.js';
import {LocaleRegistry} from '../locales/locale-registry.js';

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
   * Resolves constructor arguments for a registry-coded error. Subclasses call this via
   * `super(...SoloError.resolveCodeArgs(...))` to avoid duplicating registry lookup logic.
   */
  protected static resolveCodeArgs(
    code: SoloErrorCode,
    context?: ErrorContext,
    cause?: Error,
  ): [string, Error | undefined, object, {errorCode: SoloErrorCode; context?: ErrorContext}] {
    const entry: ErrorRegistryEntry | undefined = ErrorRegistry.get(code);
    const template: string = entry ? LocaleRegistry.getMessage(entry.messageTemplate) : ErrorRegistry.formatCode(code);
    const message: string = ErrorRegistry.interpolate(template, context ?? {});
    return [message, cause, {}, {errorCode: code, context}];
  }

  /**
   * Returns the localized, context-interpolated troubleshooting steps for this error,
   * or undefined if none are defined in the registry.
   */
  public getTroubleshootingSteps(): ReadonlyArray<string> | undefined {
    if (!this.errorCode) {
      return undefined;
    }
    const entry: ErrorRegistryEntry | undefined = ErrorRegistry.get(this.errorCode);
    if (!entry?.troubleshootingSteps) {
      return undefined;
    }
    const steps: ReadonlyArray<string> | undefined = LocaleRegistry.getTroubleshootingSteps(entry.troubleshootingSteps);
    return steps?.map((step: string): string => ErrorRegistry.interpolate(step, this.context ?? {}));
  }

  /** Returns the documentation URL for this error code, or undefined if no code is set. */
  public getDocumentUrl(): string | undefined {
    if (!this.errorCode) {
      return undefined;
    }
    return ErrorRegistry.getDocUrl(this.errorCode);
  }

  /** Returns the formatted error code label (e.g. "SOLO-1001"), or undefined if no code is set. */
  public getFormattedCode(): string | undefined {
    if (!this.errorCode) {
      return undefined;
    }
    return ErrorRegistry.formatCode(this.errorCode);
  }
}
