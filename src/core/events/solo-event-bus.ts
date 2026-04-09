// SPDX-License-Identifier: Apache-2.0

import {type AnySoloEvent, type SoloEventType} from './event-types/event-types.js';

export interface SoloEventBus {
  emit(event: AnySoloEvent): void;
  on<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void;
  off<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void;
  waitFor<T extends AnySoloEvent>(type: SoloEventType, predicate?: (event: T) => boolean): Promise<T>;
  clearHistory(type?: SoloEventType): void;
}
