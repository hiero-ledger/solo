// SPDX-License-Identifier: Apache-2.0

import {SoloEvent, SoloEventType} from './solo-event.js';

export class MirrorNodeDeployedEvent extends SoloEvent {
  public constructor(public readonly deployment: string) {
    super(SoloEventType.MirrorNodeDeployed);
  }
}
