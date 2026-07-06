// SPDX-License-Identifier: Apache-2.0

import {type MessageLevel} from './message-level.js';

export interface SoloLogger {
  setDevMode(developmentMode: boolean): void;

  isDevMode(): boolean;

  nextTraceId(): void;

  /**
   * Adds or updates a single structured log binding.
   *
   * Log bindings are MDC-style key/value pairs that are automatically attached
   * to structured log entries written by the logger. This makes fields such as
   * namespace, deployment, cluster reference, command name, or node alias easier
   * to query in JSON log files.
   *
   * These bindings are intended for file/structured logging only and should not
   * change user-facing CLI output such as showUser(...), showJSON(...), lists, or
   * progress messages.
   *
   * Passing undefined, null, or an empty string removes the binding.
   */
  setLogBinding(key: string, value: unknown): void;

  /**
   * Adds or updates multiple structured log bindings.
   *
   * This is useful once command or task configuration has been resolved and
   * several common fields should be attached to following structured log entries.
   */
  addLogBindings(bindings: Record<string, unknown>): void;

  /**
   * Clears structured log bindings.
   *
   * If keys are provided, only those bindings are removed. If no keys are
   * provided, all active log bindings are cleared.
   */
  clearLogBindings(...keys: string[]): void;

  prepMeta(meta?: object | any): object | any;

  showUser(message: any, ...arguments_: any): void;

  /**
   * Shows {@link message} to the user when running a standalone command, or demotes it to debug-level
   * (log file only) when running inside a one-shot command, where the one-shot Finish phase prints
   * the consolidated summary and extra mechanics would just be noise.
   */
  showUserUnlessOneShot(message: string): void;

  /**
   * Starts buffering user-facing output (showUser/showJSON/showList/showMessageGroup).
   *
   * While deferred, those messages are written to the structured log file but not printed to the
   * terminal. This avoids corrupting a live Listr render (e.g. the concurrent one-shot deploy),
   * where direct console writes collide with the renderer's cursor control. Errors
   * (showUserError) are never buffered.
   */
  beginDeferredUserOutput(): void;

  /**
   * Prints any buffered user-facing output and disables buffering.
   *
   * Intended to be called once the live renderer has stopped, so the human-facing summary prints
   * cleanly in one block.
   */
  flushDeferredUserOutput(): void;

  showUserError(error: Error | any): void;

  error(message: any, ...arguments_: any): void;

  warn(message: any, ...arguments_: any): void;

  info(message: any, ...arguments_: any): void;

  debug(message: any, ...arguments_: any): void;

  showList(title: string, items: string[]): void;

  showListIfNotEmpty(title: string, items: string[]): void;

  showJSON(title: string, object: object): void;

  addMessageGroup(key: string, title: string): void;

  getMessageGroup(key: string): string[];

  addMessageGroupMessage(key: string, message: string): void;

  showMessageGroup(key: string, messageLevel?: MessageLevel): void;

  getMessageGroupKeys(): string[];

  showAllMessageGroups(): void;

  flush(callback: (error?: Error) => void): void;
}
