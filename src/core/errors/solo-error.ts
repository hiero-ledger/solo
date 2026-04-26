// SPDX-License-Identifier: Apache-2.0

import {LocaleRegistry} from '../locales/locale-registry.js';

type SoloErrorInit = {
  messageKey: string;
  code?: string;
  troubleshootingKey?: string;
  context?: Readonly<Record<string, string | number | boolean | undefined>>;
};

export class SoloError extends Error {
  public readonly statusCode?: number;
  protected readonly code?: string;
  protected readonly messageKey?: string;
  protected readonly troubleshootingKey?: string;

  protected static readonly DOC_BASE: string = 'https://solo.hiero.org/docs/errors';

  /**
   * Create a custom error object
   *
   * @param messageOrInit error message string, or an init object with messageKey, code, troubleshootingKey, and optional context
   * @param cause source error (if any)
   * @param meta additional metadata (if any)
   */
  public constructor(
    messageOrInit: string | SoloErrorInit,
    public override cause: Error | any = {},
    public meta: any = {},
  ) {
    const resolvedMessage: string =
      typeof messageOrInit === 'string'
        ? messageOrInit
        : LocaleRegistry.getMessage(messageOrInit.messageKey, messageOrInit.context);
    super(resolvedMessage);
    this.name = this.constructor.name;
    // eslint-disable-next-line unicorn/no-useless-error-capture-stack-trace
    Error.captureStackTrace(this, this.constructor);
    if (typeof messageOrInit !== 'string') {
      this.code = messageOrInit.code;
      this.messageKey = messageOrInit.messageKey;
      this.troubleshootingKey = messageOrInit.troubleshootingKey;
    }
    if (cause && Object.keys(cause).length > 0) {
      // if the cause message is the same as this message and this is a SoloError, re-throw the cause to avoid redundant wrapping
      if (
        resolvedMessage?.toString().trim() === cause.message?.toString().trim() &&
        this.name.toString().trim() === cause.name?.toString().trim()
      ) {
        throw cause;
      }
      this.cause = cause;
      this.statusCode = this.cause.statusCode ?? this.cause.code;
      delete this.cause.headers; // remove headers to avoid leaking sensitive info
    }
  }

  /** Returns the troubleshooting steps for this error, or undefined if none are defined. */
  public getTroubleshootingSteps(): ReadonlyArray<string> | undefined {
    return this.troubleshootingKey ? LocaleRegistry.getTroubleshootingSteps(this.troubleshootingKey) : undefined;
  }

  /** Returns the documentation URL for this error, or undefined if not defined. */
  public getDocumentUrl(): string | undefined {
    return this.code ? `${SoloError.DOC_BASE}/${this.code}` : undefined;
  }

  /** Returns the formatted error code label (e.g. "SOLO-1001"), or undefined if not defined. */
  public getFormattedCode(): string | undefined {
    return this.code;
  }
}
