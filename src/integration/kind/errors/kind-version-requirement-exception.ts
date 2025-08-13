// SPDX-License-Identifier: Apache-2.0

/**
 * An exception thrown when the executable does not meet the required version for Kind.
 */
export class KindVersionRequirementException extends Error {
  public constructor(messageOrCause: string | Error, cause?: Error) {
    if (messageOrCause instanceof Error) {
      super(messageOrCause.message);
      this.cause = messageOrCause;
    } else {
      super(messageOrCause);
      if (cause) {
        this.cause = cause;
      }
    }
    this.name = this.constructor.name;
  }
}
