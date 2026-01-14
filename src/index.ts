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
import {SilentBreak} from './core/errors/silent-break.js';
import {getSoloVersion} from '../version.js';
import {ArgumentProcessor} from './argument-processor.js';

if (!process.stdout.isTTY) {
  chalk.level = 0;
}

export async function main(argv: string[], context?: {logger: SoloLogger}) {
  try {
    Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, constants.SOLO_LOG_LEVEL);
  } catch (error) {
    console.error(`Error initializing container: ${error?.message}`, error);
    throw new SoloError('Error initializing container');
  }

  const logger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

  logger.debug(`EXECUTING WITH ARGS: ${argv.join(' ')}`);

  if (context) {
    // save the logger so that solo.ts can use it to properly flush the logs and exit
    context.logger = logger;
  }
  process.on('unhandledRejection', (reason: {error?: Error; target?: {url?: string}}, promise): void => {
    logger.showUserError(
      new SoloError(
        `Unhandled Rejection at: ${JSON.stringify(promise)}, reason: ${JSON.stringify(reason)}, target: ${reason.target?.url}`,
        reason.error,
      ),
    );
  });
  process.on('uncaughtException', (error, origin): void => {
    logger.showUserError(new SoloError(`Uncaught Exception: ${error}, origin: ${origin}`, error));
  });

  logger.debug('Initializing Solo CLI');
  constants.LISTR_DEFAULT_RENDERER_OPTION.logger = new ListrLogger({processOutput: new CustomProcessOutput(logger)});
  if (argv.length >= 3 && ['-version', '--version', '-v', '--v'].includes(argv[2])) {
    // Check for --output flag (K8s ecosystem standard)
    const outputFlagIndex: number = argv.findIndex(
      (argument): boolean => argument.startsWith('--output=') || argument === '--output' || argument === '-o',
    );
    let outputFormat: string = '';

    if (outputFlagIndex !== -1) {
      const outputArgument: string = argv[outputFlagIndex];
      if (outputArgument.startsWith('--output=')) {
        outputFormat = outputArgument.split('=')[1];
      } else if (outputFlagIndex + 1 < argv.length) {
        outputFormat = argv[outputFlagIndex + 1];
      }
    }

    const version: string = getSoloVersion();

    // Handle different output formats
    switch (outputFormat) {
      case 'json': {
        logger.showUser(JSON.stringify({version}, undefined, 2));
        break;
      }
      case 'yaml': {
        logger.showUser(`version: ${version}`);
        break;
      }
      case 'wide': {
        logger.showUser(version);
        break;
      }
      default: {
        // Default: full formatted banner
        logger.showUser(
          chalk.cyan('\n******************************* Solo *********************************************'),
        );
        logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(version));
        logger.showUser(
          chalk.cyan('**********************************************************************************'),
        );
        break;
      }
    }
    throw new SilentBreak('displayed version information, exiting');
  }

  return ArgumentProcessor.process(argv);
}
