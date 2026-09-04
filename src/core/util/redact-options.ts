// SPDX-License-Identifier: Apache-2.0

/**
 * Options for configuring argument redaction behavior.
 */
export interface RedactOptions {
  /**
   * Flags whose immediately following argument should be fully redacted.
   * For example, `['--password', '-p']` causes the value after `--password` or `-p` to be masked.
   */
  flagsToRedactNextArgument?: string[];

  /**
   * Flags that use a `key=value` style for their following argument (e.g. `--set`, `--set-string`).
   * The value portion is redacted only when the key matches the sensitive pattern.
   */
  setStyleFlags?: string[];
}
