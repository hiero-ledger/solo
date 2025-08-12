// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './core/errors/solo-error.js';
import {Flags as flags} from './commands/flags.js';
import {type Middlewares} from './core/middlewares.js';
import {InjectTokens} from './core/dependency-injection/inject-tokens.js';
import {type HelpRenderer} from './core/help-renderer.js';
import {container} from 'tsyringe-neo';
import {type SoloLogger} from './core/logging/solo-logger.js';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import {applyHelpMiddleware} from './core/help-middleware.js';

export class ArgumentProcessor {
  public static process(argv: string[]) {
    const logger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);
    const middlewares: Middlewares = container.resolve(InjectTokens.Middlewares);
    const helpRenderer: HelpRenderer = container.resolve(InjectTokens.HelpRenderer);
    const commands = container.resolve(InjectTokens.Commands) as {getCommandDefinitions(): any[]};

    logger.debug('Initializing commands');
    // Create the root command and apply help middleware
    const rootCmd = applyHelpMiddleware(
      yargs(hideBin(argv))
        .scriptName('')
        .usage('Usage:\n  solo <command> [options]')
        .alias('h', 'help')
        .alias('v', 'version')
        .help(false) // disable default help to enable custom help renderer
        .command(commands.getCommandDefinitions())
        .strict()
        .demand(1, 'Select a command'),
      helpRenderer,
    );

    rootCmd.middleware(
      [
        middlewares.printCustomHelp(rootCmd),
        middlewares.setLoggerDevFlag(),
        // @ts-expect-error - TS2322: To assign middlewares
        middlewares.processArgumentsAndDisplayHeader(),
      ],
      false, // applyBeforeValidate is false as otherwise middleware is called twice
    );

    // Expand the terminal width to the maximum available
    rootCmd.wrap(null);

    rootCmd.fail((message, error) => {
      if (message) {
        if (
          message.includes('Unknown argument') ||
          message.includes('Missing required argument') ||
          message.includes('Select')
        ) {
          logger.showUser(message);
          rootCmd.showHelp(output => {
            helpRenderer.render(rootCmd, output);
          });
        } else {
          logger.showUserError(new SoloError(`Error running Solo CLI, failure occurred: ${message ? message : ''}`));
        }
        if (message.includes('Unknown argument') || message.includes('Missing required argument')) {
          rootCmd.exit(1, error);
        } else {
          rootCmd.exit(0, error);
        }
      }
    });

    logger.debug('Setting up flags');
    // set root level flags
    flags.setOptionalCommandFlags(rootCmd, flags.devMode, flags.forcePortForward);
    logger.debug('Parsing root command (executing the commands)');
    return rootCmd.parse();
  }
}
