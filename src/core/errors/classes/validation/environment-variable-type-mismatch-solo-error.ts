// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an environment variable overriding a config field holds a value the field's
 * declared type cannot accept — a numeric field given `abc`, or a boolean flag given `maybe`. Without this
 * the value would reach the schema as a raw string, where `"abc"` compares as never-less-than and any
 * non-empty string reads as true.
 */
export class EnvironmentVariableTypeMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  private static readonly ACCEPTED_VALUES: Readonly<Record<string, string>> = {
    boolean: 'Accepted values are true, false, 1, and 0, in any case',
    number: 'Provide an integer or decimal literal',
  };

  public constructor(variableName: string, configKey: string, value: string, expected: string) {
    super({
      message: `Environment variable ${variableName} sets config key '${configKey}' to '${value}', which is not a valid ${expected}`,
      code: ErrorCodeRegistry.ENVIRONMENT_VARIABLE_TYPE_MISMATCH,
      troubleshootingSteps:
        `${EnvironmentVariableTypeMismatchSoloError.ACCEPTED_VALUES[expected]}\n` +
        `Unset ${variableName} to fall back to the configured default`,
    });
  }
}
