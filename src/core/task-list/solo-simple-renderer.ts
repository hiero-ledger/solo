// SPDX-License-Identifier: Apache-2.0

import {
  color,
  LISTR_LOGGER_STDERR_LEVELS,
  LISTR_LOGGER_STYLE,
  ListrLogger,
  ListrLogLevels,
  type ListrRenderer,
  type ListrSimpleRendererOptions,
  type ListrSimpleRendererTask,
  type ListrSimpleRendererTaskOptions,
  ListrTaskEventType,
  type ListrTaskMessage,
  ListrTaskState,
  type LoggerFieldOptions,
  type LoggerFormat,
  type PresetTimer,
} from 'listr2';

/**
 * How often, while a task is still running, a progress line is printed to confirm that the task is
 * still making progress.
 */
const PROGRESS_INTERVAL_MILLISECONDS: number = 15_000;

/**
 * Renderer options accepted by {@link SoloSimpleRenderer}. Extends the simple renderer options with
 * {@link showSubtasks}, which solo toggles (via its collapsable Listr options) to hide subtask lines.
 */
interface SoloSimpleRendererOptions extends ListrSimpleRendererOptions {
  /** When `false`, subtasks are not rendered and only the parent line/progress line is shown. */
  showSubtasks?: boolean;
}

/**
 * Solo's variant of the built-in listr2 `simple` renderer. It is append-only and avoids the two
 * problems solo hits with the default renderer:
 *
 * 1. The default renderer redraws the whole task tree in place via cursor movement, which corrupts the
 *    output once the tree grows taller than the terminal. This renderer only ever appends lines, so it
 *    cannot overflow.
 * 2. The built-in `simple` renderer prints every task twice — once when it starts (`❯`) and once when it
 *    completes (`✔`). This renderer does not print on start. Instead, a running task only prints while it
 *    is genuinely long-lived: a progress line every {@link PROGRESS_INTERVAL_MILLISECONDS} confirming it
 *    is still working, followed by a single final line when it finishes. A task that finishes within the
 *    first interval therefore prints exactly one line.
 */
export class SoloSimpleRenderer implements ListrRenderer {
  public static nonTTY: boolean = true;
  public static rendererOptions: SoloSimpleRendererOptions = {};
  public static rendererTaskOptions: ListrSimpleRendererTaskOptions = {};

  private readonly logger: ListrLogger<ListrLogLevels>;

  private readonly cache: {
    rendererOptions: Map<string, SoloSimpleRendererOptions>;
    rendererTaskOptions: Map<string, ListrSimpleRendererTaskOptions>;
  } = {
    rendererOptions: new Map(),
    rendererTaskOptions: new Map(),
  };

  /** Active progress timers, keyed by task id. */
  private readonly progressTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  /** Wall-clock start time (epoch milliseconds) of each running task, keyed by task id. */
  private readonly startTimes: Map<string, number> = new Map();

  public constructor(
    private readonly tasks: ListrSimpleRendererTask[],
    private options: SoloSimpleRendererOptions,
  ) {
    this.options = {
      ...SoloSimpleRenderer.rendererOptions,
      ...options,
      icon: {...LISTR_LOGGER_STYLE.icon, ...options?.icon},
      color: {
        ...LISTR_LOGGER_STYLE.color,
        // Explicitly pin the icon colors: green ✔ for completed, yellow ❯ for pending (in progress),
        // red ✖ for failed. Callers may still override any of these via rendererOptions.color.
        [ListrLogLevels.COMPLETED]: color.green,
        [ListrLogLevels.STARTED]: color.yellow,
        [ListrLogLevels.FAILED]: color.red,
        ...options?.color,
      },
    };
    this.logger = this.options.logger ?? new ListrLogger({useIcons: true, toStderr: LISTR_LOGGER_STDERR_LEVELS});
    // ListrLogger does not default its icon/color maps, so a task's icon is only rendered (and coloured)
    // when they are assigned explicitly here.
    this.logger.options.icon = this.options.icon;
    this.logger.options.color = this.options.color;
  }

  public render(): void {
    this.renderer(this.tasks);
  }

  public end(): void {
    for (const progressTimer of this.progressTimers.values()) {
      clearInterval(progressTimer);
    }
    this.progressTimers.clear();
    this.startTimes.clear();
  }

  private renderer(tasks: ListrSimpleRendererTask[]): void {
    for (const task of tasks) {
      this.calculate(task);

      const rendererTaskOptions: ListrSimpleRendererTaskOptions | undefined = this.cache.rendererTaskOptions.get(
        task.id,
      );

      task.once(ListrTaskEventType.CLOSED, (): void => {
        this.stopProgress(task.id);
        this.reset(task);
      });

      task.on(ListrTaskEventType.SUBTASK, (subtasks: ListrSimpleRendererTask[]): void => {
        if (this.showSubtasks(task.id)) {
          this.renderer(subtasks);
        }
      });

      task.on(ListrTaskEventType.STATE, (state: ListrTaskState): void => {
        // Prompt handling must run regardless of title: while a task is prompting, the managed output
        // stream is hijacked so the prompt reaches the real terminal (otherwise it is buffered and the
        // user never sees the question), then released once the prompt is answered. The progress line is
        // naturally suppressed meanwhile because a prompting task is no longer in the STARTED state.
        if (state === ListrTaskState.PROMPT) {
          this.logger.process.hijack();
          task.on(ListrTaskEventType.PROMPT, (prompt: string): void => {
            this.logger.process.toStderr(prompt, false);
          });
          return;
        }
        // Release on both PROMPT_COMPLETED and PROMPT_FAILED: an aborted prompt still hijacked the
        // stream, and failing to release it would make the next prompt's hijack() throw.
        if (state === ListrTaskState.PROMPT_COMPLETED || state === ListrTaskState.PROMPT_FAILED) {
          task.off(ListrTaskEventType.PROMPT);
          this.logger.process.release();
          return;
        }

        if (!task.hasTitle()) {
          return;
        }

        if (state === ListrTaskState.STARTED) {
          this.startProgress(task, rendererTaskOptions);
        } else if (state === ListrTaskState.COMPLETED) {
          this.stopProgress(task.id);
          const timer: PresetTimer | undefined = rendererTaskOptions?.timer;
          this.logger.log(
            ListrLogLevels.COMPLETED,
            task.title,
            timer && {
              suffix: {
                ...timer,
                condition: !!task.message?.duration && timer.condition,
                args: [task.message.duration],
              },
            },
          );
        }
      });

      task.on(ListrTaskEventType.OUTPUT, (output: string): void => {
        this.logger.log(ListrLogLevels.OUTPUT, output);
      });

      task.on(ListrTaskEventType.MESSAGE, (message: ListrTaskMessage): void => {
        if (message.error !== undefined) {
          this.stopProgress(task.id);
          this.logger.log(ListrLogLevels.FAILED, task.title, {
            suffix: {field: `${ListrLogLevels.FAILED}: ${message.error}`, format: (): LoggerFormat => color.red},
          });
        } else if (message.skip !== undefined) {
          this.stopProgress(task.id);
          this.logger.log(ListrLogLevels.SKIPPED, task.title, {
            suffix: {field: `${ListrLogLevels.SKIPPED}: ${message.skip}`, format: (): LoggerFormat => color.yellow},
          });
        } else if (message.rollback !== undefined) {
          this.stopProgress(task.id);
          this.logger.log(ListrLogLevels.ROLLBACK, task.title, {
            suffix: {field: `${ListrLogLevels.ROLLBACK}: ${message.rollback}`, format: (): LoggerFormat => color.red},
          });
        } else if (message.retry !== undefined) {
          this.logger.log(ListrLogLevels.RETRY, task.title, {
            suffix: {field: `${ListrLogLevels.RETRY}:${message.retry.count}`, format: (): LoggerFormat => color.red},
          });
        }
      });
    }
  }

  private startProgress(
    task: ListrSimpleRendererTask,
    rendererTaskOptions: ListrSimpleRendererTaskOptions | undefined,
  ): void {
    this.stopProgress(task.id);
    this.startTimes.set(task.id, Date.now());

    const timer: PresetTimer | undefined = rendererTaskOptions?.timer;
    const progressTimer: ReturnType<typeof setInterval> = setInterval((): void => {
      // A finalized task's timer may fire once more before it is cleared; ignore it.
      if (!task.isStarted()) {
        return;
      }
      // A parent whose subtasks are visible already shows activity through its children.
      if (task.hasSubtasks() && this.showSubtasks(task.id)) {
        return;
      }

      const elapsedMilliseconds: number = Date.now() - (this.startTimes.get(task.id) ?? Date.now());
      const options: LoggerFieldOptions | undefined = timer && {
        // On a pending progress line the elapsed time is always yellow (rather than the timer preset's
        // duration-based green/red used on completed lines) and gets a trailing "..." inside the
        // brackets, e.g. [15s...], to signal the task is still running.
        suffix: {
          ...timer,
          condition: timer.condition,
          format: (): LoggerFormat => color.yellow,
          field: (durationMilliseconds: number): string =>
            `${typeof timer.field === 'function' ? timer.field(durationMilliseconds) : timer.field}...`,
          args: [elapsedMilliseconds],
        },
      };
      this.logger.log(ListrLogLevels.STARTED, task.title, options);
    }, PROGRESS_INTERVAL_MILLISECONDS);

    // Do not let the progress timer keep the process alive on its own.
    progressTimer.unref?.();
    this.progressTimers.set(task.id, progressTimer);
  }

  private stopProgress(taskId: string): void {
    const progressTimer: ReturnType<typeof setInterval> | undefined = this.progressTimers.get(taskId);
    if (progressTimer) {
      clearInterval(progressTimer);
      this.progressTimers.delete(taskId);
    }
    this.startTimes.delete(taskId);
  }

  private showSubtasks(taskId: string): boolean {
    return this.cache.rendererOptions.get(taskId)?.showSubtasks !== false;
  }

  private calculate(task: ListrSimpleRendererTask): void {
    if (this.cache.rendererOptions.has(task.id) && this.cache.rendererTaskOptions.has(task.id)) {
      return;
    }

    const rendererOptions: SoloSimpleRendererOptions = {...this.options, ...task.rendererOptions};
    this.cache.rendererOptions.set(task.id, rendererOptions);
    this.cache.rendererTaskOptions.set(task.id, {timer: rendererOptions.timer, ...task.rendererTaskOptions});
  }

  private reset(task: ListrSimpleRendererTask): void {
    this.cache.rendererOptions.delete(task.id);
    this.cache.rendererTaskOptions.delete(task.id);
  }
}
