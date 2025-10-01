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

export class ArgumentProcessor {
  public static process(argv: string[]) {
    const logger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);
    const middlewares: Middlewares = container.resolve(InjectTokens.Middlewares);
    const helpRenderer: HelpRenderer = container.resolve(InjectTokens.HelpRenderer);
    const commands = container.resolve(InjectTokens.Commands);

    logger.debug('Initializing commands');
    const rootCmd = yargs(hideBin(argv))
      .scriptName('')
      .usage('Usage:\n  solo <command> [options]')
      .alias('h', 'help')
      .alias('v', 'version')
      .help(false) // disable default help to enable custom help renderer
      // @ts-expect-error - TS2769: No overload matches this call.
      .command(commands.getCommandDefinitions())
      .strict()
      .demand(1, 'Select a command');

    rootCmd.middleware(
      [
        middlewares.printCustomHelp(rootCmd),
        // @ts-expect-error - TS2322: To assign middlewares
        middlewares.setLoggerDevFlag(),
        // @ts-expect-error - TS2322: To assign middlewares
        middlewares.processArgumentsAndDisplayHeader(),
        // @ts-expect-error - TS2322: To assign middlewares
        middlewares.initSystemFiles(),
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
          if (message.includes('Select')) {
            // show use what subcommands are available then exit normally
            rootCmd.exit(0, error);
          }
          // Set exit code but don't exit immediately - allows I/O buffers to flush
          process.exitCode = 1;
          // Throw error to propagate through async call chains if given unknown argument
          throw new SoloError(message, error);
        } else {
          logger.showUserError(new SoloError(`Error running Solo CLI, failure occurred: ${message ?? ''}`));
          throw new SoloError(message, error);
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
