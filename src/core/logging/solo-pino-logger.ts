// SPDX-License-Identifier: Apache-2.0

import pino, {type Logger as PinoLogger, type TransportTargetOptions, type LoggerOptions, type StreamEntry} from 'pino';
import pinoPretty from 'pino-pretty';
import {mkdirSync} from 'node:fs';
import {v4 as uuidv4} from 'uuid';
// eslint-disable-next-line unicorn/import-style
import * as util from 'node:util';
import chalk from 'chalk';
import * as constants from '../constants.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from './solo-logger.js';
import {OneShotState} from '../one-shot-state.js';
import {SoloErrors} from '../errors/solo-errors.js';
import {SoloError} from '../errors/solo-error.js';
import {MessageLevel} from './message-level.js';

type ChalkColor = typeof chalk.red;

/**
 * Pino-based implementation of the SoloLogger interface.
 *
 * Emits two files under constants.SOLO_LOGS_DIR:
 *  - solo.ndjson : newline-delimited JSON (authoritative)
 *  - solo.log    : pretty human-readable
 */
@injectable()
export class SoloPinoLogger implements SoloLogger {
  private readonly pinoLogger: PinoLogger;
  private traceId?: string;
  private readonly logBindings: Record<string, unknown> = {};
  private messageGroupMap: Map<string, string[]> = new Map();
  private deferredUserOutput: string[] | undefined;
  private readonly MINOR_LINE_SEPARATOR: string =
    '-------------------------------------------------------------------------------';

  private static readonly MAX_BOX_WIDTH: number = 120;
  private static readonly MIN_BOX_WIDTH: number = 70;

  /**
   * @param logLevel - the log level to use (fatal|error|warn|info|debug|trace)
   * @param developmentMode - if true, show full stack traces in error messages
   */
  public constructor(
    @inject(InjectTokens.LogLevel) logLevel?: string,
    @inject(InjectTokens.DevelopmentMode) private developmentMode?: boolean,
    @inject(InjectTokens.OneShotState) private readonly oneShotState?: OneShotState,
  ) {
    logLevel = patchInject(logLevel, InjectTokens.LogLevel, this.constructor.name) ?? 'info';
    this.developmentMode = patchInject(developmentMode, InjectTokens.DevelopmentMode, this.constructor.name);

    this.nextTraceId();

    // Ensure logs directory exists
    const logsDirectory: string = constants.SOLO_LOGS_DIR;
    try {
      mkdirSync(logsDirectory, {recursive: true});
    } catch {
      // no-op: if this fails, pino will attempt to create the files and error if impossible
    }

    // Configure dual outputs: NDJSON (machine) + pretty (human)
    const ndjsonTarget: TransportTargetOptions = {
      target: 'pino/file',
      level: logLevel,
      options: {destination: PathEx.join(logsDirectory, 'solo.ndjson')},
    };

    const prettyTarget: TransportTargetOptions = {
      target: 'pino-pretty',
      level: logLevel,
      options: {
        destination: PathEx.join(logsDirectory, 'solo.log'), // write formatted logs to <logsDirectory>/solo.log
        translateTime: 'HH:MM:ss.l', // prepend timestamp as [HH:MM:ss.ms]
        colorize: false, // disable pino-pretty color output (avoid ANSI codes)
        messageKey: 'msg', // use the 'msg' property as the main log message
        messageFormat: '{msg} [traceId="{traceId}"]', // format line: message + traceId suffix
        ignore: 'pid,hostname,traceId', // exclude these fields from printed output
        colorizeObjects: false, // don't colorize objects or nested values
        crlf: false, // use '\n' (Unix newlines) instead of '\r\n' (Windows)
        hideObject: false, // don't hide full object payloads after message
      },
    };

    const baseOptions: LoggerOptions = {
      level: logLevel,
      // Always include traceId and active log bindings when set via mixin
      mixin: (): Record<string, unknown> => ({
        ...this.logBindings,
        ...(this.traceId ? {traceId: this.traceId} : {}),
      }),
      // Redact obvious secrets if they sneak into objects
      redact: {
        paths: ['*.authorization', '*.Authorization', '*.accessToken', '*.privateKey', '*.operatorKey'],
        remove: true,
      },
    };

    if (process.env.CI === 'true') {
      const ndjsonStream: ReturnType<typeof pino.destination> = pino.destination({
        dest: PathEx.join(logsDirectory, 'solo.ndjson'),
        sync: true,
      });
      const prettyStream: ReturnType<typeof pinoPretty> = pinoPretty({
        ...prettyTarget.options,
        destination: pino.destination({
          dest: PathEx.join(logsDirectory, 'solo.log'),
          sync: true,
        }),
      });
      this.pinoLogger = pino(
        baseOptions,
        pino.multistream([
          {level: logLevel, stream: ndjsonStream},
          {level: logLevel, stream: prettyStream},
        ] as StreamEntry[]),
      );
    } else {
      this.pinoLogger = pino(baseOptions, pino.transport({targets: [ndjsonTarget, prettyTarget]}));
    }
  }

  public setDevMode(developmentMode: boolean): void {
    this.debug(`dev mode logging: ${developmentMode}`);
    this.developmentMode = developmentMode;
  }

  public isDevMode(): boolean {
    return this.developmentMode ?? false;
  }

  public nextTraceId(): void {
    this.traceId = uuidv4();
  }

  public setLogBinding(key: string, value: unknown): void {
    if (value === undefined || value === null || value === '') {
      delete this.logBindings[key];
      return;
    }

    this.logBindings[key] = value;
  }

  public addLogBindings(bindings: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(bindings)) {
      this.setLogBinding(key, value);
    }
  }

  public clearLogBindings(...keys: string[]): void {
    if (keys.length === 0) {
      for (const key of Object.keys(this.logBindings)) {
        delete this.logBindings[key];
      }
      return;
    }

    for (const key of keys) {
      delete this.logBindings[key];
    }
  }

  public prepMeta(meta: Record<string, unknown> = {}): Record<string, unknown> {
    if (this.traceId) {
      (meta as Record<string, unknown>)['traceId'] = this.traceId;
    }
    return meta;
  }

  public showUser(message: unknown, ...arguments_: unknown[]): void {
    const formatted: string = util.format(String(message), ...arguments_.map(String));
    this.writeUser(formatted);
    // Mirror existing behavior: also persist to logs at info level
    this.info(formatted);
  }

  public showUserUnlessOneShot(message: string): void {
    if (this.oneShotState?.isActive()) {
      this.debug(message);
    } else {
      this.showUser(message);
    }
  }

  /**
   * Single sink for user-facing terminal output. Honors silent mode and the deferred-output buffer.
   * Does not write to the structured log file; callers persist to the log separately.
   */
  private writeUser(line: string): void {
    if (constants.SOLO_SILENT_MODE) {
      return;
    }
    if (this.deferredUserOutput) {
      this.deferredUserOutput.push(line);
      return;
    }
    console.log(line);
  }

  public beginDeferredUserOutput(): void {
    this.deferredUserOutput ??= [];
  }

  public flushDeferredUserOutput(): void {
    const buffered: string[] | undefined = this.deferredUserOutput;
    this.deferredUserOutput = undefined;
    if (!buffered || constants.SOLO_SILENT_MODE) {
      return;
    }
    for (const line of buffered) {
      console.log(line);
    }
  }

  private stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
  }

  public padWithBorder(
    message: string,
    chalkColor: (...text: unknown[]) => string = chalk.red,
    length: number = 83,
  ): string {
    const border: string = chalkColor('│');
    const messageLines: string[] = [];
    for (const line of message.split('\n')) {
      const repeats: number = Math.max(0, length - this.stripAnsi(line).length - 4);
      messageLines.push(`${border} ${line}${' '.repeat(repeats)} ${border}`);
    }
    return messageLines.join('\n');
  }

  private buildCauseChain(error: Error): Error[] {
    const chain: Error[] = [error];
    let cause: unknown = error.cause;
    let depth: number = 0;
    while (cause instanceof Error && depth < 10) {
      chain.push(cause);
      cause = cause.cause;
      depth += 1;
    }
    return chain;
  }

  private getFormattedCode(error: Error): string {
    const formattedCode: string | undefined = error instanceof SoloError ? error.getFormattedCode() : undefined;
    return formattedCode ? `[${formattedCode}] ` : '';
  }

  private buildContentLines(error: Error, causeChain: Error[]): string[] {
    const lines: string[] = [];
    if (this.developmentMode) {
      let indent: string = ' ';
      let prefix: string = '';
      for (const entry of causeChain) {
        const messageText: string = this.getFormattedCode(entry) + entry.message;
        lines.push(chalk.red(indent + prefix + messageText));
        if (entry.stack) {
          const formatted: string = entry.stack
            .split('\n')
            .filter((line: string): boolean => !line.includes('node:internal'))
            .join('\n')
            .trim();
          lines.push(...(indent + formatted).split('\n').map((line: string): string => chalk.gray(line)), '');
        }
        indent += '  ';
        prefix += 'Caused by: ';
      }
    } else {
      const errorMessage: string = this.getFormattedCode(error) + error.message;
      lines.push(...errorMessage.split('\n').map((line: string): string => chalk.red(line)));
    }

    if (!this.developmentMode) {
      // The outermost error is often a generic wrapper (e.g. one-shot deploy failed); the deepest
      // SoloError in the cause chain carries the most specific troubleshooting guidance. The chain is
      // ordered outermost-first, so the last qualifying entry is the deepest one.
      let troubleshootingSource: SoloError | undefined;
      for (const entry of causeChain) {
        if (entry instanceof SoloError && (entry.getTroubleshootingSteps()?.length ?? 0) > 0) {
          troubleshootingSource = entry;
        }
      }
      const troubleshootingSteps: ReadonlyArray<string> | undefined = troubleshootingSource?.getTroubleshootingSteps();
      if (troubleshootingSteps && troubleshootingSteps.length > 0) {
        for (const step of troubleshootingSteps) {
          lines.push(chalk.cyan('  →') + ' ' + step);
        }
      }
    }
    if (error instanceof SoloError) {
      const documentUrl: string | undefined = error.getDocumentUrl();
      if (documentUrl) {
        lines.push('', chalk.cyan(`Learn more: ${documentUrl}`));
      }
    }
    return lines;
  }

  private wrapLine(line: string, maxWidth: number): string[] {
    const plainText: string = this.stripAnsi(line);
    if (plainText.length <= maxWidth) {
      return [line];
    }

    // eslint-disable-next-line no-control-regex
    const ansiPrefix: string = line.match(/^(?:\[[0-9;]*m)+/)?.[0] ?? '';
    const ansiSuffix: string = ansiPrefix ? '[0m' : '';

    const indent: string = plainText.match(/^(\s*)/)?.[1] ?? '';

    const result: string[] = [];
    let remaining: string = plainText;

    while (remaining.length > maxWidth) {
      // Search outside the indent so wrapping never splits within it and
      // continuation lines stay at the same indentation level.
      const relativeSpaceAt: number = remaining.slice(indent.length).lastIndexOf(' ', maxWidth - 1 - indent.length);
      const spaceAt: number = relativeSpaceAt === -1 ? -1 : indent.length + relativeSpaceAt;
      const breakAt: number = spaceAt > 0 ? spaceAt : maxWidth;
      result.push(ansiPrefix + remaining.slice(0, breakAt) + ansiSuffix);
      const afterBreak: string = remaining.slice(spaceAt > 0 ? breakAt + 1 : breakAt);
      remaining = indent + afterBreak;
    }

    if (remaining) {
      result.push(ansiPrefix + remaining + ansiSuffix);
    }

    return result.length > 0 ? result : [line];
  }

  private renderErrorBox(lines: string[]): void {
    const maxInteriorWidth: number = SoloPinoLogger.MAX_BOX_WIDTH - 4;
    const wrappedLines: string[] = lines.flatMap((line: string): string[] => this.wrapLine(line, maxInteriorWidth));
    const maxContentWidth: number = Math.max(...wrappedLines.map((l): number => this.stripAnsi(l).length));
    const boxWidth: number = Math.min(
      SoloPinoLogger.MAX_BOX_WIDTH,
      Math.max(SoloPinoLogger.MIN_BOX_WIDTH, maxContentWidth + 4),
    );
    const interiorWidth: number = boxWidth - 4;
    console.log(chalk.red(`╭─ ERROR ─${'─'.repeat(interiorWidth - 7)}╮`));
    for (const line of wrappedLines) {
      console.log(this.padWithBorder(line, chalk.red, boxWidth));
    }
    console.log(chalk.red(`╰${'─'.repeat(interiorWidth + 2)}╯`));
  }

  private buildSilentErrorOutput(error: Error, causeChain: Error[]): Record<string, unknown> {
    return {
      level: 'ERROR',
      message: this.getFormattedCode(error) + error.message,
      stack: error.stack,
      causes: causeChain.slice(1).map((cause: Error): Record<string, unknown> => ({
        message: this.getFormattedCode(cause) + cause.message,
        stack: cause.stack,
      })),
    };
  }

  public showUserError(error: unknown): void {
    const normalizedError: Error = error instanceof Error ? error : new Error(String(error));
    const causeChain: Error[] = this.buildCauseChain(normalizedError);
    const lines: string[] = this.buildContentLines(normalizedError, causeChain);

    if (constants.SOLO_SILENT_MODE) {
      console.error(JSON.stringify(this.buildSilentErrorOutput(normalizedError, causeChain), undefined, 2));
    } else {
      this.renderErrorBox(lines);
    }

    this.toPino('error', error, []);
  }

  public error(message: unknown, ...arguments_: unknown[]): void {
    this.toPino('error', message, arguments_);
  }

  public warn(message: unknown, ...arguments_: unknown[]): void {
    this.toPino('warn', message, arguments_);
  }

  public info(message: unknown, ...arguments_: unknown[]): void {
    this.toPino('info', message, arguments_);
  }

  public debug(message: unknown, ...arguments_: unknown[]): void {
    this.toPino('debug', message, arguments_);
  }

  public showList(title: string, items: string[] = []): boolean {
    this.showUser(chalk.green(`\n *** ${title} ***`));
    this.showUser(chalk.green(this.MINOR_LINE_SEPARATOR));
    if (items.length > 0) {
      for (const name of items) {
        this.showUser(chalk.cyan(` - ${name}`));
      }
    } else {
      this.showUser(chalk.blue('[ None ]'));
    }

    this.showUser('\n');
    return true;
  }

  public showListIfNotEmpty(title: string, items: string[] = []): boolean {
    if (items.length === 0) {
      return false;
    }
    return this.showList(title, items);
  }

  public showJSON(title: string, object: object): void {
    this.showUser(chalk.green(`\n *** ${title} ***`));
    this.showUser(chalk.green(this.MINOR_LINE_SEPARATOR));
    const serialized: string = JSON.stringify(object, undefined, 2);
    this.writeUser(serialized);
  }

  public getMessageGroup(key: string): string[] {
    if (!this.messageGroupMap.has(key)) {
      throw new SoloErrors.internal.loggerMessageGroupNotFound(key);
    }
    return this.messageGroupMap.get(key);
  }

  public addMessageGroup(key: string, title: string): void {
    if (this.messageGroupMap.has(key)) {
      this.warn(`Message group with key "${key}" already exists. Skipping.`);
      return;
    }
    this.messageGroupMap.set(key, [`${title}:`]);
    this.debug(`Added message group "${title}" with key "${key}".`);
  }

  public addMessageGroupMessage(key: string, message: string): void {
    if (!this.messageGroupMap.has(key)) {
      throw new SoloErrors.internal.loggerMessageGroupNotFound(key);
    }
    this.messageGroupMap.get(key)!.push(message);
    this.debug(`Added message to group "${key}": ${message}`);
  }

  public showMessageGroup(key: string, messageLevel: MessageLevel = MessageLevel.INFO): void {
    if (!this.messageGroupMap.has(key)) {
      this.warn(`Message group with key "${key}" does not exist.`);
      return;
    }

    let titleColor: ChalkColor;
    let textColor: ChalkColor;
    switch (messageLevel) {
      case MessageLevel.ERROR: {
        titleColor = chalk.red;
        textColor = chalk.red;
        break;
      }
      case MessageLevel.WARN: {
        titleColor = chalk.yellow;
        textColor = chalk.yellow;
        break;
      }
      default: {
        titleColor = chalk.green;
        textColor = chalk.cyan;
        break;
      }
    }

    const messages: string[] = this.messageGroupMap.get(key)!;
    this.showUser(titleColor(`\n *** ${messages[0]} ***`));
    this.showUser(titleColor(this.MINOR_LINE_SEPARATOR));
    for (let index: number = 1; index < messages.length; index++) {
      this.showUser(textColor(` - ${messages[index]}`));
    }
    this.showUser(titleColor(this.MINOR_LINE_SEPARATOR));
    this.debug(`Displayed message group "${key}".`);
  }

  public getMessageGroupKeys(): string[] {
    return [...this.messageGroupMap.keys()];
  }

  public showAllMessageGroups(): void {
    const keys: string[] = this.getMessageGroupKeys();
    if (keys.length === 0) {
      this.debug('No message groups available.');
      return;
    }
    for (const key of keys) {
      this.showMessageGroup(key);
    }
  }

  public flush(callback: (error?: Error) => void): void {
    this.info('Flushing logs and exiting...');
    this.pinoLogger.flush(callback);
  }

  private toPino(level: 'info' | 'warn' | 'error' | 'debug', message: unknown, arguments_: unknown[]): void {
    // Build base object (traceId via mixin already present, but include explicitly for clarity in unit tests)
    let object: Record<string, unknown> = {};
    const meta: Record<string, unknown> = this.prepMeta({});

    // Prefer structured errors/objects when provided
    if (message instanceof Error) {
      object = {...object, ...meta, err: message};
      this.pinoLogger[level](object, (message as Error).message ?? 'Error');
      return;
    }

    if (message && typeof message === 'object') {
      object = {...object, ...meta, ...(message as Record<string, unknown>)};
      const message_: string | undefined =
        arguments_.length > 0 ? util.format('%s', ...arguments_.map(String)) : undefined;
      if (message_) {
        this.pinoLogger[level](object, message_);
      } else {
        this.pinoLogger[level](object);
      }
      return;
    }

    const formatted: string = util.format(String(message), ...(arguments_ as unknown[]));
    this.pinoLogger[level](meta, formatted);
  }
}
