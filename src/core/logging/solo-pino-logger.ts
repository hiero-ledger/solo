// SPDX-License-Identifier: Apache-2.0

import pino, {type Logger as PinoLogger, type TransportTargetOptions, type LoggerOptions} from 'pino';
import pinoPretty from 'pino-pretty';
import {mkdirSync} from 'node:fs';
import {v4 as uuidv4} from 'uuid';
// eslint-disable-next-line unicorn/import-style
import * as util from 'node:util';
import chalk, {type ChalkInstance} from 'chalk';
import * as constants from '../constants.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from './solo-logger.js';
import {SoloError} from '../errors/solo-error.js';
import {MessageLevel} from './message-level.js';

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
  private messageGroupMap: Map<string, string[]> = new Map();
  private readonly MINOR_LINE_SEPARATOR: string =
    '-------------------------------------------------------------------------------';

  /**
   * @param logLevel - the log level to use (fatal|error|warn|info|debug|trace)
   * @param developmentMode - if true, show full stack traces in error messages
   */
  public constructor(
    @inject(InjectTokens.LogLevel) logLevel?: string,
    @inject(InjectTokens.DevelopmentMode) private developmentMode?: boolean,
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
      // Always include traceId when set via mixin
      mixin: (): {traceId?: string} => (this.traceId ? {traceId: this.traceId} : {}),
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
      this.pinoLogger = pino(baseOptions, pino.multistream([{stream: ndjsonStream}, {stream: prettyStream}] as any));
    } else {
      this.pinoLogger = pino(baseOptions, pino.transport({targets: [ndjsonTarget, prettyTarget]}));
    }
  }

  public setDevMode(developmentMode: boolean): void {
    this.debug(`dev mode logging: ${developmentMode}`);
    this.developmentMode = developmentMode;
  }

  public nextTraceId(): void {
    this.traceId = uuidv4();
  }

  public prepMeta(meta: Record<string, unknown> = {}): Record<string, unknown> {
    if (this.traceId) {
      (meta as Record<string, unknown>)['traceId'] = this.traceId;
    }
    return meta;
  }

  public showUser(message: unknown, ...arguments_: unknown[]): void {
    const formatted = util.format(String(message), ...arguments_.map(String));
    console.log(formatted);
    // Mirror existing behavior: also persist to logs at info level
    this.info(formatted);
  }

  public showUserError(error: unknown): void {
    // Build chain of causes (up to 10 deep)
    const errorObject = error as {message?: unknown; stack?: string; cause?: unknown} | undefined;
    const stack: {message: string; stacktrace?: string}[] = [
      {message: errorObject?.message ? String(errorObject.message) : String(error), stacktrace: errorObject?.stack},
    ];

    if (errorObject?.cause) {
      let depth: number = 0;
      let cause: unknown = errorObject.cause;
      while (cause && depth < 10) {
        const c = cause as {message?: unknown; stack?: string; cause?: unknown};
        if (c.stack) {
          stack.push({message: c.message ? String(c.message) : String(c), stacktrace: c.stack});
        }
        cause = c.cause;
        depth += 1;
      }
    }

    console.log(chalk.red('*********************************** ERROR *****************************************'));
    if (this.developmentMode) {
      let prefix: string = '';
      let indent: string = '';
      for (const s of stack) {
        console.log(indent + prefix + chalk.yellow(String(s.message)));
        if (s.stacktrace) {
          // Keep it readable; trim obvious internal noise
          const formatted: string = String(s.stacktrace)
            .split('\n')
            .filter((l): boolean => !l.includes('node:internal'))
            .join('\n')
            .trim();
          console.log(indent + chalk.gray(formatted) + '\n');
        }
        indent += '  ';
        prefix = 'Caused by: ';
      }
    } else {
      const lines: string[] = (error as any)?.message
        ? String((error as any).message).split('\n')
        : String(error).split('\n');
      for (const line of lines) {
        console.log(chalk.yellow(line));
      }
    }
    console.log(chalk.red('***********************************************************************************'));

    // Persist the error with structure
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

  public showJSON(title: string, object: object): void {
    this.showUser(chalk.green(`\n *** ${title} ***`));
    this.showUser(chalk.green(this.MINOR_LINE_SEPARATOR));
    console.log(JSON.stringify(object, null, ' '));
  }

  public getMessageGroup(key: string): string[] {
    if (!this.messageGroupMap.has(key)) {
      throw new SoloError(`Message group with key "${key}" does not exist.`);
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
      throw new SoloError(`Message group with key "${key}" does not exist.`);
    }
    this.messageGroupMap.get(key)!.push(message);
    this.debug(`Added message to group "${key}": ${message}`);
  }

  public showMessageGroup(key: string, messageLevel: MessageLevel = MessageLevel.INFO): void {
    if (!this.messageGroupMap.has(key)) {
      this.warn(`Message group with key "${key}" does not exist.`);
      return;
    }

    let titleColor: ChalkInstance;
    let textColor: ChalkInstance;
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
      this.pinoLogger[level](object as any, (message as Error).message ?? 'Error');
      return;
    }

    if (message && typeof message === 'object') {
      object = {...object, ...meta, ...(message as Record<string, unknown>)};
      const message_: string | undefined =
        arguments_.length > 0 ? util.format('%s', ...arguments_.map(String)) : undefined;
      if (message_) {
        this.pinoLogger[level](object as any, message_);
      } else {
        this.pinoLogger[level](object as any);
      }
      return;
    }

    const formatted: string = util.format(String(message), ...(arguments_ as any[]));
    this.pinoLogger[level](meta as any, formatted);
  }
}
