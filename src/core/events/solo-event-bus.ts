// SPDX-License-Identifier: Apache-2.0

import {type AnySoloEvent, type SoloEventType} from './event-types/event-types.js';
import {type Duration} from '../time/duration.js';

export interface SoloEventBus {
  emit(event: AnySoloEvent): void;
  on<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void;
  off<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void;
  waitFor<T extends AnySoloEvent>(
    type: SoloEventType,
    predicate?: (event: T) => boolean,
    timeout?: Duration,
  ): Promise<T>;
  /** Clears all recorded event history. Optionally scoped to a single event type. */
  clearHistory(type?: SoloEventType): void;
}
