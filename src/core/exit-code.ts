// SPDX-License-Identifier: Apache-2.0

/** The exit codes of the Solo CLI process. */
export enum ExitCode {
  /** The command completed. */
  SUCCESS = 0,

  /** The command failed for a reason other than its input, for example a failed deployment. */
  FAILURE = 1,

  /** The input was rejected: a CLI usage error, or a validation error that the user must correct. */
  INVALID_INPUT = 2,
}
