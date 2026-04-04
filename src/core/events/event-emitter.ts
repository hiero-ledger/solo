// SPDX-License-Identifier: Apache-2.0

import {type AnySoloEvent} from './event-types.js';

export interface EventEmitter {
  emit(event: AnySoloEvent): void;
}
