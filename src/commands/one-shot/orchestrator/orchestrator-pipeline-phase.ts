// SPDX-License-Identifier: Apache-2.0

import {type SoloListr, type SoloListrTask, type SoloListrTaskWrapper} from '../../../types/index.js';
import {type SoloEventType} from '../../../core/events/event-types/solo-event.js';
import {type AnySoloEvent} from '../../../core/events/event-types/solo-event-type.js';
import {type SoloEventBus} from '../../../core/events/solo-event-bus.js';
import {Duration} from '../../../core/time/duration.js';
import {type OrchestratorStep} from './orchestrator-step.js';
import {ExecutionMode} from './execution-mode.js';
import {SoloErrors} from '../../../core/errors/solo-errors.js';

type DeploymentEvent = AnySoloEvent & {deployment: string};

type WaitCondition = {
  eventType: SoloEventType;
  timeout: Duration;
};

export class OrchestratorPipelinePhase<TConfig extends {deployment: string}, TContext> {
  private readonly waitConditions: WaitCondition[] = [];

  public static EXECUTION_MODE: {SEQUENTIAL: ExecutionMode; CONCURRENT: ExecutionMode} = {
    SEQUENTIAL: ExecutionMode.SEQUENTIAL,
    CONCURRENT: ExecutionMode.CONCURRENT,
  };

  public constructor(
    private readonly title: string,
    private readonly step: OrchestratorStep<TConfig, TContext> | undefined,
    private readonly subPhases: ReadonlyArray<OrchestratorPipelinePhase<TConfig, TContext>> = [],
    private readonly executionMode:
      | ExecutionMode
      | ((getConfig: () => TConfig) => ExecutionMode) = OrchestratorPipelinePhase.EXECUTION_MODE.SEQUENTIAL,
    private readonly exitOnError: boolean = true,
    private readonly rendererOptions?: object,
    private readonly skipFunction?: (getConfig: () => TConfig) => boolean,
    private readonly collapseChildren: boolean | ((getConfig: () => TConfig) => boolean) = false,
  ) {}

  public static composite<TConfig extends {deployment: string}, TContext>(
    title: string,
    subPhases: ReadonlyArray<OrchestratorPipelinePhase<TConfig, TContext>>,
    executionMode: ExecutionMode | ((getConfig: () => TConfig) => ExecutionMode) = OrchestratorPipelinePhase
      .EXECUTION_MODE.SEQUENTIAL,
    exitOnError: boolean = true,
    rendererOptions?: object,
    skipFunction?: (getConfig: () => TConfig) => boolean,
    collapseChildren: boolean | ((getConfig: () => TConfig) => boolean) = false,
  ): OrchestratorPipelinePhase<TConfig, TContext> {
    return new OrchestratorPipelinePhase<TConfig, TContext>(
      title,
      undefined,
      subPhases,
      executionMode,
      exitOnError,
      rendererOptions,
      skipFunction,
      collapseChildren,
    );
  }

  public withWaitCondition(eventType: SoloEventType, timeout: Duration = Duration.ofMinutes(5)): this {
    this.waitConditions.push({eventType, timeout});
    return this;
  }

  public asListrTask(getConfig: () => TConfig, eventBus: SoloEventBus): SoloListrTask<TContext> {
    const shouldInjectFailure: boolean =
      (process.env.SOLO_FAIL_AFTER_STEP ?? '').replaceAll("'", '').replaceAll('"', '') === this.title;

    if (this.subPhases.length > 0) {
      return {
        title: this.title,
        skip: this.skipFunction ? (): boolean => this.skipFunction!(getConfig) : false,
        task: (_: TContext, task: SoloListrTaskWrapper<TContext>): SoloListr<TContext> => {
          const isConcurrent: boolean =
            typeof this.executionMode === 'function'
              ? this.executionMode(getConfig) === OrchestratorPipelinePhase.EXECUTION_MODE.CONCURRENT
              : this.executionMode === OrchestratorPipelinePhase.EXECUTION_MODE.CONCURRENT;
          const subTasks: SoloListrTask<TContext>[] = this.subPhases.map(
            (phase: OrchestratorPipelinePhase<TConfig, TContext>): SoloListrTask<TContext> =>
              phase.asListrTask(getConfig, eventBus),
          );
          if (shouldInjectFailure) {
            subTasks.push(this.buildFailureInjectionTask());
          }

          const shouldCollapseChildren: boolean =
            typeof this.collapseChildren === 'function' ? this.collapseChildren(getConfig) : this.collapseChildren;
          const collapsedRendererOptions: object = shouldCollapseChildren ? {showSubtasks: false} : {};
          const mergedRendererOptions: object = {...this.rendererOptions, ...collapsedRendererOptions};
          return task.newListr(subTasks, {
            concurrent: isConcurrent,
            exitOnError: this.exitOnError,
            ...(Object.keys(mergedRendererOptions).length > 0 ? {rendererOptions: mergedRendererOptions} : {}),
          });
        },
      };
    }

    if (this.waitConditions.length === 0) {
      const innerTask: SoloListrTask<TContext> = (this.step as OrchestratorStep<TConfig, TContext>).asListrTask(
        getConfig,
      );
      if (!shouldInjectFailure) {
        return innerTask;
      }
      const failureTask: SoloListrTask<TContext> = this.buildFailureInjectionTask();
      return {
        ...innerTask,
        task: (_: TContext, taskWrapper: SoloListrTaskWrapper<TContext>): SoloListr<TContext> =>
          taskWrapper.newListr([innerTask, failureTask], {exitOnError: true}),
      };
    }

    const innerTask: SoloListrTask<TContext> = (this.step as OrchestratorStep<TConfig, TContext>).asListrTask(
      getConfig,
    );
    return {
      title: this.title,
      skip: innerTask.skip,
      task: async (_: TContext, taskWrapper: SoloListrTaskWrapper<TContext>): Promise<SoloListr<TContext>> => {
        for (const {eventType, timeout} of this.waitConditions) {
          await eventBus.waitFor<DeploymentEvent>(
            eventType,
            (event: DeploymentEvent): boolean => event.deployment === getConfig().deployment,
            timeout,
          );
        }
        const subTasks: SoloListrTask<TContext>[] = [innerTask];
        if (shouldInjectFailure) {
          subTasks.push(this.buildFailureInjectionTask());
        }
        return taskWrapper.newListr(subTasks);
      },
    };
  }

  private buildFailureInjectionTask(): SoloListrTask<TContext> {
    const title: string = this.title;
    return {
      title: `[test] fail after '${title}'`,
      task: (): never => {
        throw new SoloErrors.internal.injectedFailure(title);
      },
    };
  }
}
