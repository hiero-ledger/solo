// SPDX-License-Identifier: Apache-2.0

import {SemanticVersion} from '../../../utils/semantic-version.js';

export function resolveVersionValue(
  argvValue: unknown,
  configuredValue: unknown,
  defaultValue: string,
): SemanticVersion<string> {
  if (typeof argvValue === 'string' && argvValue.trim().length > 0) {
    return new SemanticVersion<string>(argvValue);
  }

  if (typeof configuredValue === 'string' && configuredValue.trim().length > 0) {
    return new SemanticVersion<string>(configuredValue);
  }

  return new SemanticVersion<string>(defaultValue);
}
