// SPDX-License-Identifier: Apache-2.0

import {SoloEvent, SoloEventType} from './solo-event.js';

export class NodesStartedEvent extends SoloEvent {
  public constructor(public readonly deployment: string) {
    super(SoloEventType.NodesStarted);
  }
}
