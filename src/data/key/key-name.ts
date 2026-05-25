// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../core/errors/solo-errors.js';

export class KeyName {
  private constructor() {
    throw new SoloErrors.internal.unsupportedOperation('This class cannot be instantiated');
  }

  public static isArraySegment(segment: string): boolean {
    return segment && segment?.match(/^[0-9]+$/g)?.length > 0;
  }
}
