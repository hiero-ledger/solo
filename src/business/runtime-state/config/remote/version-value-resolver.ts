// SPDX-License-Identifier: Apache-2.0

import {SemanticVersion} from '../../../utils/semantic-version.js';

export function resolveVersionValue(
  argvValue: string | undefined,
  configuredValue: string | undefined,
  defaultValue: string,
): SemanticVersion<string> {
  if (argvValue?.trim().length > 0) {
    return new SemanticVersion<string>(argvValue);
  }

  if (configuredValue?.trim().length > 0) {
    return new SemanticVersion<string>(configuredValue);
  }

  return new SemanticVersion<string>(defaultValue);
}
