// SPDX-License-Identifier: Apache-2.0

import {EventEmitter as NodeEventEmitter} from 'node:events';
import {inject, injectable} from 'tsyringe-neo';
import {SoloEventType} from './event-types/solo-event.js';
import {AnySoloEvent} from './event-types/solo-event-type.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {type SoloEventBus} from './solo-event-bus.js';
import {Duration} from '../time/duration.js';
import {SoloError} from '../errors/solo-error.js';

@injectable()
export class DefaultSoloEventBus implements SoloEventBus {
  private readonly emitter: NodeEventEmitter = new NodeEventEmitter();
  // Keep an in-memory log of all emitted events, grouped by event type.
  private readonly history: Map<SoloEventType, AnySoloEvent[]> = new Map();

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public emit(event: AnySoloEvent): void {
    // Record event in history so callers can query or have waitFor resolve
    // even if the event was emitted before they started listening.
    let list: AnySoloEvent[] | undefined = this.history.get(event.type);
    if (!list) {
      list = [];
      this.history.set(event.type, list);
    }
    list.push(event);

    // Log the event for debugging/inspection. Use debug level to avoid
    // cluttering normal output, but this can be changed if needed.
    this.logger.debug(`DefaultSoloEventBus.emit: type=${String(event.type)}`, event);

    this.emitter.emit(event.type, event);
  }

  public on<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void {
    this.emitter.on(type, handler as (...arguments_: unknown[]) => void);
  }

  public off<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void {
    this.emitter.off(type, handler as (...arguments_: unknown[]) => void);
  }

  public clearHistory(type?: SoloEventType): void {
    if (type === undefined) {
      this.history.clear();
    } else {
      this.history.delete(type);
    }
  }

  public async waitFor<T extends AnySoloEvent>(
    type: SoloEventType,
    predicate?: (event: T) => boolean,
    timeout: Duration = Duration.ofSeconds(60),
  ): Promise<T> {
    return new Promise<T>((resolve: (value: T | PromiseLike<T>) => void, reject: (reason: unknown) => void): void => {
      const timer: NodeJS.Timeout = setTimeout((): void => {
        this.emitter.off(type, handler as (...arguments_: unknown[]) => void);
        reject(
          new SoloError(`waitFor timed out after ${timeout.toMillis()}ms waiting for event type: ${String(type)}`),
        );
      }, timeout.toMillis());
      // Ensure we only resolve once if handler and history check race.
      let settled: boolean = false;
      // Register handler first to avoid missing events that arrive while
      // we're checking the history.
      const handler: (event: T) => void = (event: T): void => {
        try {
          if (!predicate || predicate(event)) {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timer);
            this.emitter.off(type, handler as (...arguments_: unknown[]) => void);
            resolve(event);
          }
        } catch (error) {
          clearTimeout(timer);
          this.emitter.off(type, handler as (...arguments_: unknown[]) => void);
          reject(new SoloError(`Error in waitFor handler predicate for event type: ${String(type)}`, error));
        }
      };

      this.emitter.on(type, handler as (...arguments_: unknown[]) => void);

      // Then check the history for already-emitted events (newest first).
      const events: AnySoloEvent[] | undefined = this.history.get(type);
      if (events) {
        for (let index: number = events.length - 1; index >= 0; index--) {
          const candidate: T = events[index] as T;
          try {
            if (!predicate || predicate(candidate)) {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timer);
              this.emitter.off(type, handler as (...arguments_: unknown[]) => void);
              resolve(candidate);
              return;
            }
          } catch (error) {
            clearTimeout(timer);
            this.emitter.off(type, handler as (...arguments_: unknown[]) => void);
            reject(new SoloError(`Error in waitFor history check predicate for event type: ${String(type)}`, error));
          }
        }
      }
    });
  }
}
