// SPDX-License-Identifier: Apache-2.0

import * as winston from 'winston';
import {v4 as uuidv4} from 'uuid';
import * as util from 'node:util';
import chalk from 'chalk';
import * as constants from '../constants.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from './solo-logger.js';
import {SoloError} from '../errors/solo-error.js';

const customFormat = winston.format.combine(
  winston.format.label({label: 'SOLO', message: false}),

  winston.format.splat(),

  // include timestamp in logs
  winston.format.timestamp(),

  winston.format.ms(),

  // add label metadata
  winston.format.label({label: ''}),

  // convert levels to upper case
  winston.format(data => {
    data.level = data.level.toUpperCase();
    return data;
  })(),

  // use custom format TIMESTAMP [LABEL] LEVEL: MESSAGE
  winston.format.printf(data => `${data.timestamp}|${data.level}| ${data.message}`),

  // Ignore log messages if they have { private: true }
  winston.format(data => (data.private ? false : data))(),
);

@injectable()
export class SoloWinstonLogger implements SoloLogger {
  private winstonLogger: winston.Logger;
  private traceId?: string;
  private messageGroupMap: Map<string, string[]> = new Map();
  private readonly MINOR_LINE_SEPARATOR: string =
    '-------------------------------------------------------------------------------';

  /**
   * @param logLevel - the log level to use
   * @param developmentMode - if true, show full stack traces in error messages
   */
  public constructor(
    @inject(InjectTokens.LogLevel) logLevel?: string,
    @inject(InjectTokens.DevelopmentMode) private developmentMode?: boolean | null,
  ) {
    logLevel = patchInject(logLevel, InjectTokens.LogLevel, this.constructor.name);
    this.developmentMode = patchInject(developmentMode, InjectTokens.DevelopmentMode, this.constructor.name);

    this.nextTraceId();

    this.winstonLogger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(customFormat, winston.format.json()),
      transports: [new winston.transports.File({filename: PathEx.join(constants.SOLO_LOGS_DIR, 'solo.log')})],
    });
  }

  public setDevMode(developmentMode: boolean): void {
    this.debug(`dev mode logging: ${developmentMode}`);
    this.developmentMode = developmentMode;
  }

  public nextTraceId(): void {
    this.traceId = uuidv4();
  }

  public prepMeta(meta: object | any = {}): object | any {
    meta.traceId = this.traceId;
    return meta;
  }

  public showUser(message: any, ...arguments_: any): void {
    console.log(util.format(message, ...arguments_));
    this.info(util.format(message, ...arguments_));
  }

  public showUserError(error: Error | any): void {
    const stack: {stacktrace: any; message: any}[] = [{message: error.message, stacktrace: error.stack}];
    if (error.cause) {
      let depth: number = 0;
      let cause: any = error.cause;
      while (cause !== undefined && depth < 10) {
        if (cause.stack) {
          stack.push({message: cause.message, stacktrace: cause.stack});
        }

        cause = cause.cause;
        depth += 1;
      }
    }

    console.log(chalk.red('*********************************** ERROR *****************************************'));
    if (this.developmentMode) {
      let prefix: string = '';
      let indent: string = '';
      for (const s of stack) {
        console.log(indent + prefix + chalk.yellow(s.message));
        // Remove everything after the first "Caused by: " and add indentation
        const formattedStacktrace: string = s.stacktrace
          .replace(/Caused by:.*/s, '')
          .replaceAll(/\n\s*/g, '\n' + indent)
          .trim();
        console.log(indent + chalk.gray(formattedStacktrace) + '\n');
        indent += '  ';
        prefix = 'Caused by: ';
      }
    } else {
      const lines: string[] = error.message.split('\n');
      for (const line of lines) {
        console.log(chalk.yellow(line));
      }
    }
    console.log(chalk.red('***********************************************************************************'));

    this.error(error.message, error);
  }

  public error(message: any, ...arguments_: any): void {
    this.winstonLogger.error(message, ...arguments_, this.prepMeta());
  }

  public warn(message: any, ...arguments_: any): void {
    this.winstonLogger.warn(message, ...arguments_, this.prepMeta());
  }

  public info(message: any, ...arguments_: any): void {
    this.winstonLogger.info(message, ...arguments_, this.prepMeta());
  }

  public debug(message: any, ...arguments_: any): void {
    this.winstonLogger.debug(message, ...arguments_, this.prepMeta());
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
    this.messageGroupMap.get(key).push(message);
    this.debug(`Added message to group "${key}": ${message}`);
  }

  public showMessageGroup(key: string): void {
    if (!this.messageGroupMap.has(key)) {
      this.warn(`Message group with key "${key}" does not exist.`);
      return;
    }
    const messages: string[] = this.messageGroupMap.get(key);
    this.showUser(chalk.green(`\n *** ${messages[0]} ***`));
    this.showUser(chalk.green(this.MINOR_LINE_SEPARATOR));
    for (let index: number = 1; index < messages.length; index++) {
      this.showUser(chalk.cyan(` - ${messages[index]}`));
    }
    this.showUser(chalk.green(this.MINOR_LINE_SEPARATOR));
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
}
