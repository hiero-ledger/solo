// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a configuration value holds something the field's declared type cannot accept —
 * a numeric field given `abc`, or a boolean flag given `maybe`. Without this the value would reach the
 * schema as a raw string, where `"abc"` compares as never-less-than and any non-empty string reads as true.
 *
 * <p>The origin is supplied by the caller rather than assumed, because a value can arrive from an
 * environment variable or from a YAML file and the user needs to be told which one to correct.
 */
export class ConfigValueTypeMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  private static readonly ACCEPTED_VALUES: Readonly<Record<string, string>> = {
    boolean: 'Accepted values are true, false, 1, and 0, in any case',
    number: 'Provide an integer or decimal literal',
  };

  /**
   * @param origin - how the value reached the config system, phrased to open a sentence, for example
   *   {@code "Environment variable SOLO_FF_SKIP_NODE_PING"} or {@code "Config file 'solo-config.yaml'"}.
   * @param configKey - the dotted config key the value was read into.
   * @param value - the rejected value, as written.
   * @param expected - the type the schema declares for the field.
   */
  public constructor(origin: string, configKey: string, value: string, expected: string) {
    super({
      message: `${origin} sets config key '${configKey}' to '${value}', which is not a valid ${expected}`,
      code: ErrorCodeRegistry.CONFIG_VALUE_TYPE_MISMATCH,
      troubleshootingSteps:
        `${ConfigValueTypeMismatchSoloError.ACCEPTED_VALUES[expected]}\n` +
        `Correct or remove the value set by ${origin} to fall back to the configured default`,
    });
  }
}
