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

export type ExecutionMode = 'sequential' | 'concurrent';

export class Phase<TConfig extends {deployment: string}, TContext> {
  private readonly waitConditions: WaitCondition[] = [];
  private readonly title: string;
  private readonly step: OrchestratorStep<TConfig, TContext> | undefined;
  private readonly subPhases: ReadonlyArray<Phase<TConfig, TContext>>;
  private readonly executionMode: ExecutionMode | ((getConfig: () => TConfig) => ExecutionMode);
  private readonly exitOnError: boolean;
  private readonly rendererOptions: object | undefined;
  private readonly skipFunction: ((getConfig: () => TConfig) => boolean) | undefined;

  public static EXECUTION_MODE: {SEQUENTIAL: ExecutionMode; CONCURRENT: ExecutionMode} = {
    SEQUENTIAL: 'sequential',
    CONCURRENT: 'concurrent',
  };

  public constructor(
    title: string,
    step: OrchestratorStep<TConfig, TContext> | undefined,
    subPhases: ReadonlyArray<Phase<TConfig, TContext>> = [],
    executionMode: ExecutionMode | ((getConfig: () => TConfig) => ExecutionMode) = Phase.EXECUTION_MODE.SEQUENTIAL,
    exitOnError: boolean = true,
    rendererOptions?: object,
    skipFunction?: (getConfig: () => TConfig) => boolean,
  ) {
    this.title = title;
    this.step = step;
    this.subPhases = subPhases;
    this.executionMode = executionMode;
    this.exitOnError = exitOnError;
    this.rendererOptions = rendererOptions;
    this.skipFunction = skipFunction;
  }

  public static composite<TConfig extends {deployment: string}, TContext>(
    title: string,
    subPhases: ReadonlyArray<Phase<TConfig, TContext>>,
    executionMode: ExecutionMode | ((getConfig: () => TConfig) => ExecutionMode) = Phase.EXECUTION_MODE.SEQUENTIAL,
    exitOnError: boolean = true,
    rendererOptions?: object,
    skipFunction?: (getConfig: () => TConfig) => boolean,
  ): Phase<TConfig, TContext> {
    return new Phase<TConfig, TContext>(
      title,
      undefined,
      subPhases,
      executionMode,
      exitOnError,
      rendererOptions,
      skipFunction,
    );
  }

  public withWaitCondition(eventType: SoloEventType, timeout: Duration = Duration.ofMinutes(5)): this {
    this.waitConditions.push({eventType, timeout});
    return this;
  }

  public asListrTask(getConfig: () => TConfig, eventBus: SoloEventBus): SoloListrTask<TContext> {
    if (this.subPhases.length > 0) {
      return {
        title: this.title,
        ...(this.skipFunction
          ? {
              skip: (): boolean => (this.skipFunction as (getConfig: () => TConfig) => boolean)(getConfig),
            }
          : {}),
        task: (_: TContext, task: SoloListrTaskWrapper<TContext>): SoloListr<TContext> => {
          const isConcurrent: boolean =
            typeof this.executionMode === 'function'
              ? this.executionMode(getConfig) === Phase.EXECUTION_MODE.CONCURRENT
              : this.executionMode === Phase.EXECUTION_MODE.CONCURRENT;
          return task.newListr(
            this.subPhases.map(
              (phase: Phase<TConfig, TContext>): SoloListrTask<TContext> => phase.asListrTask(getConfig, eventBus),
            ),
            {
              concurrent: isConcurrent,
              exitOnError: this.exitOnError,
              ...(this.rendererOptions ? {rendererOptions: this.rendererOptions} : {}),
            },
          );
        },
      };
    }

    if (this.waitConditions.length === 0) {
      return (this.step as OrchestratorStep<TConfig, TContext>).asListrTask(getConfig);
    }

    return {
      title: this.title,
      task: async (_: TContext, task: SoloListrTaskWrapper<TContext>): Promise<SoloListr<TContext>> => {
        for (const {eventType, timeout} of this.waitConditions) {
          await eventBus.waitFor<DeploymentEvent>(
            eventType,
            (event: DeploymentEvent): boolean => event.deployment === getConfig().deployment,
            timeout,
          );
        }
        return task.newListr([(this.step as OrchestratorStep<TConfig, TContext>).asListrTask(getConfig)]);
      },
    };
  }
}
