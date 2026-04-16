// SPDX-License-Identifier: Apache-2.0

import {type SoloEventType} from './event-types.js';

export abstract class SoloEvent {
  public constructor(public readonly type: SoloEventType) {}
}
