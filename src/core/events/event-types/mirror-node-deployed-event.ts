// SPDX-License-Identifier: Apache-2.0

import {SoloEventType} from './event-types.js';
import {SoloEvent} from './solo-event.js';

export class MirrorNodeDeployedEvent extends SoloEvent {
  public constructor(public readonly deployment: string) {
    super(SoloEventType.MirrorNodeDeployed);
  }
}
