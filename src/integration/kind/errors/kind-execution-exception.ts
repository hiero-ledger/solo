// SPDX-License-Identifier: Apache-2.0

/**
 * Exception thrown when the execution of the Kind executable fails.
 */
export class KindExecutionException extends Error {
  /**
   * The default message to use when no message is provided
   */
  private static readonly DEFAULT_MESSAGE: string = 'Execution of the Kind command failed with exit code: %d';

  /**
   * The non-zero system exit code returned by the Kind executable or the operating system
   */
  private readonly exitCode: number;

  /**
   * The standard output of the Kind executable
   */
  private readonly stdOut: string;

  /**
   * The standard error of the Kind executable
   */
  private readonly stdErr: string;

  public constructor(
    exitCode: number,
    messageOrStdOutOrCause?: string | Error,
    stdErrorOrCause?: string | Error,
    stdErrorParameter?: string,
  ) {
    let message: string;
    let cause: Error | undefined;
    let stdOut: string = '';
    let stdError: string = '';

    if (messageOrStdOutOrCause instanceof Error) {
      // Constructor with exitCode and cause
      message = KindExecutionException.DEFAULT_MESSAGE.replace('%d', exitCode.toString());
      cause = messageOrStdOutOrCause;
    } else if (typeof messageOrStdOutOrCause === 'string') {
      if (stdErrorOrCause instanceof Error) {
        // Constructor with exitCode, message, and cause
        message = messageOrStdOutOrCause;
        cause = stdErrorOrCause;
      } else if (typeof stdErrorOrCause === 'string') {
        if (stdErrorParameter) {
          // Constructor with exitCode, message, stdOut, and stdErr
          message = messageOrStdOutOrCause;
          stdOut = stdErrorOrCause;
          stdError = stdErrorParameter;
        } else {
          // Constructor with exitCode, stdOut, and stdErr
          message = KindExecutionException.DEFAULT_MESSAGE.replace('%d', exitCode.toString());
          stdOut = messageOrStdOutOrCause;
          stdError = stdErrorOrCause;
        }
      } else {
        // Constructor with just exitCode
        message = KindExecutionException.DEFAULT_MESSAGE.replace('%d', exitCode.toString());
      }
    } else {
      // Constructor with just exitCode
      message = KindExecutionException.DEFAULT_MESSAGE.replace('%d', exitCode.toString());
    }

    super(message);
    this.name = this.constructor.name;
    this.exitCode = exitCode;
    this.stdOut = stdOut;
    this.stdErr = stdError;
    if (cause) {
      this.cause = cause;
    }
  }

  /**
   * Returns a string representation of the exception.
   * @returns A string representation of the exception
   */
  public override toString(): string {
    return `KindExecutionException{message=${this.message}, exitCode=${this.exitCode}, stdOut='${this.stdOut}', stdErr='${this.stdErr}'}`;
  }
}
