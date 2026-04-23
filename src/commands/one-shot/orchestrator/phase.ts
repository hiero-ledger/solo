// SPDX-License-Identifier: Apache-2.0

import {type SoloListr, type SoloListrTask, type SoloListrTaskWrapper} from '../../../types/index.js';
import {type AnySoloEvent, type SoloEventType} from '../../../core/events/event-types/event-types.js';
import {type SoloEventBus} from '../../../core/events/solo-event-bus.js';
import {Duration} from '../../../core/time/duration.js';
import {type OrchestratorStep} from './orchestrator-step.js';

type DeploymentEvent = AnySoloEvent & {deployment: string};

type WaitCondition = {
  eventType: SoloEventType;
  timeout: Duration;
};

export class Phase<TConfig extends {deployment: string}, TContext> {
  private readonly waitConditions: WaitCondition[] = [];

  public constructor(
    private readonly title: string,
    private readonly step: OrchestratorStep<TConfig, TContext>,
  ) {}

  public withWaitCondition(eventType: SoloEventType, timeout: Duration = Duration.ofMinutes(5)): this {
    this.waitConditions.push({eventType, timeout});
    return this;
  }

  public asListrTask(config: TConfig, eventBus: SoloEventBus): SoloListrTask<TContext> {
    if (this.waitConditions.length === 0) {
      return this.step.asListrTask(config);
    }

    return {
      title: this.title,
      task: async (_: TContext, task: SoloListrTaskWrapper<TContext>): Promise<SoloListr<TContext>> => {
        for (const {eventType, timeout} of this.waitConditions) {
          await eventBus.waitFor<DeploymentEvent>(
            eventType,
            (event: DeploymentEvent): boolean => event.deployment === config.deployment,
            timeout,
          );
        }
        return task.newListr([this.step.asListrTask(config)]);
      },
    };
  }
}
