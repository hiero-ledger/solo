// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../core/errors/solo-errors.js';

export class Regex {
  private constructor() {
    throw new SoloErrors.internal.unsupportedOperation('This class cannot be instantiated');
  }

  public static escape(string_: string): string {
    return string_.replaceAll(/[-/\\^$*+?.()|[\]{}]/g, String.raw`\$&`);
  }
}
