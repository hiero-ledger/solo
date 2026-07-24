// SPDX-License-Identifier: Apache-2.0

import {type ErrorOwnership} from './error-ownership.js';

type SoloErrorInit = {
  message: string;
  code?: string;
  troubleshootingSteps?: string;
};

export class SoloError extends Error {
  public readonly statusCode?: number;
  protected readonly code?: string;
  protected readonly troubleshootingSteps?: ReadonlyArray<string>;
  protected readonly retryable?: boolean;
  protected readonly ownership?: ErrorOwnership;

  protected static readonly DOC_BASE: string = 'https://solo.hiero.org/docs/troubleshooting/errors';
  public static readonly bugReportUrl: string = 'https://github.com/hiero-ledger/solo/issues';

  /** Maps the leading digit of an error code's numeric range to its documentation category slug. */
  private static readonly DOC_CATEGORY_BY_RANGE: Readonly<Record<string, string>> = {
    '1': 'config',
    '2': 'deployment',
    '3': 'component',
    '4': 'validation',
    '5': 'system',
    '9': 'internal',
  };

  /**
   * Create a custom error object
   *
   * @param messageOrInit error message string, or an init object with localeKey, code, and optional context
   * @param cause source error (if any)
   * @param meta additional metadata (if any)
   */
  public constructor(
    messageOrInit: string | SoloErrorInit,
    public override cause: Error | any = {},
    public meta: any = {},
  ) {
    const resolvedMessage: string = typeof messageOrInit === 'string' ? messageOrInit : messageOrInit.message;
    super(resolvedMessage);
    this.name = this.constructor.name;
    // eslint-disable-next-line unicorn/no-useless-error-capture-stack-trace
    Error.captureStackTrace(this, this.constructor);
    if (typeof messageOrInit !== 'string') {
      this.code = messageOrInit.code;
      this.troubleshootingSteps = messageOrInit.troubleshootingSteps?.split('\n');
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
    return this.troubleshootingSteps;
  }

  /** Returns the documentation URL for this error, or undefined if not defined. */
  public getDocumentUrl(): string | undefined {
    if (!this.code) {
      return undefined;
    }
    const rangeDigit: string | undefined = this.code.match(/SOLO-(\d)/)?.[1];
    const category: string | undefined = rangeDigit ? SoloError.DOC_CATEGORY_BY_RANGE[rangeDigit] : undefined;
    return category ? `${SoloError.DOC_BASE}/${category}/${this.code}/` : `${SoloError.DOC_BASE}/${this.code}/`;
  }

  /** Returns the formatted error code label (e.g. "SOLO-1001"), or undefined if not defined. */
  public getFormattedCode(): string | undefined {
    return this.code;
  }
}
