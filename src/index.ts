// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import 'dotenv/config';
// eslint-disable-next-line n/no-extraneous-import
import 'reflect-metadata';
import {container} from 'tsyringe-neo';
import {ListrLogger} from 'listr2';

import * as constants from './core/constants.js';
import {CustomProcessOutput} from './core/process-output.js';
import {type SoloLogger} from './core/logging/solo-logger.js';
import {Container} from './core/dependency-injection/container-init.js';
import {InjectTokens} from './core/dependency-injection/inject-tokens.js';
import {SoloError} from './core/errors/solo-error.js';
import {UserBreak} from './core/errors/user-break.js';
import {getSoloVersion} from '../version.js';
import {ArgumentProcessor} from './argument-processor.js';

export async function main(argv: string[], context?: {logger: SoloLogger}, extraVariables: Record<string, any> = {}) {
  for (const [key, value] of Object.entries(extraVariables)) {
    process.env[key] = value;
  }

  try {
    Container.getInstance().init();
  } catch (error) {
    console.error(`Error initializing container: ${error?.message}`, error);
    throw new SoloError('Error initializing container');
  }

  const logger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

  if (context) {
    // save the logger so that solo.ts can use it to properly flush the logs and exit
    context.logger = logger;
  }
  process.on('unhandledRejection', (reason: {error?: Error; target?: {url?: string}}, promise) => {
    logger.showUserError(
      new SoloError(
        `Unhandled Rejection at: ${JSON.stringify(promise)}, reason: ${JSON.stringify(reason)}, target: ${reason.target?.url}`,
        reason.error,
      ),
    );
  });
  process.on('uncaughtException', (error, origin) => {
    logger.showUserError(new SoloError(`Uncaught Exception: ${error}, origin: ${origin}`, error));
  });

  logger.debug('Initializing Solo CLI');
  constants.LISTR_DEFAULT_RENDERER_OPTION.logger = new ListrLogger({processOutput: new CustomProcessOutput(logger)});
  if (argv.length >= 3 && ['-version', '--version', '-v', '--v'].includes(argv[2])) {
    logger.showUser(chalk.cyan('\n******************************* Solo *********************************************'));
    logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(getSoloVersion()));
    logger.showUser(chalk.cyan('**********************************************************************************'));
    throw new UserBreak('displayed version information, exiting');
  }

  return ArgumentProcessor.process(argv);
}
