// SPDX-License-Identifier: Apache-2.0

import {EventEmitter as NodeEventEmitter} from 'node:events';
import {injectable} from 'tsyringe-neo';
import {type AnySoloEvent, type SoloEventType} from './event-types.js';
import {type EventEmitter} from './event-emitter.js';
import {type EventListener} from './event-listener.js';

@injectable()
export class SoloEventBus implements EventEmitter, EventListener {
  private readonly emitter: NodeEventEmitter = new NodeEventEmitter();

  public emit(event: AnySoloEvent): void {
    this.emitter.emit(event.type, event);
  }

  public on<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void {
    this.emitter.on(type, handler as (...arguments_: unknown[]) => void);
  }

  public off<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void {
    this.emitter.off(type, handler as (...arguments_: unknown[]) => void);
  }

  public async waitFor<T extends AnySoloEvent>(type: SoloEventType, predicate?: (event: T) => boolean): Promise<T> {
    return new Promise<T>(resolve => {
      const handler = (event: T): void => {
        if (!predicate || predicate(event)) {
          this.emitter.off(type, handler as (...arguments_: unknown[]) => void);
          resolve(event);
        }
      };
      this.emitter.on(type, handler as (...arguments_: unknown[]) => void);
    });
  }
}
