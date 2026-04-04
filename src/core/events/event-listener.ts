// SPDX-License-Identifier: Apache-2.0

import {type AnySoloEvent, type SoloEventType} from './event-types.js';

export interface EventListener {
  on<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void;
  off<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void;
}
