// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './core/errors/solo-error.js';
import {SilentBreak} from './core/errors/silent-break.js';
import {Flags as flags} from './commands/flags.js';
import {type Middlewares} from './core/middlewares.js';
import {InjectTokens} from './core/dependency-injection/inject-tokens.js';
import {type HelpRenderer} from './core/help-renderer.js';
import {container} from 'tsyringe-neo';
import {type SoloLogger} from './core/logging/solo-logger.js';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';

export class ArgumentProcessor {
  public static process(argv: string[]): any {
    const logger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);
    const middlewares: Middlewares = container.resolve(InjectTokens.Middlewares);
    const helpRenderer: HelpRenderer = container.resolve(InjectTokens.HelpRenderer);
    const commands: any = container.resolve(InjectTokens.Commands);
    const rawArgs: string[] = hideBin(argv);

    logger.debug('Initializing commands');
    const rootCmd: any = yargs(rawArgs)
      .scriptName('')
      .usage('Usage:\n  solo <command> [options]')
      .alias('h', 'help')
      .alias('v', 'version')
      .help(false) // disable default help to enable custom help renderer
      .command(commands.getCommandDefinitions())
      .strict()
      .demand(1, 'Select a command');

    rootCmd.middleware(
      [
        middlewares.printCustomHelp(rootCmd),
        middlewares.setLoggerDevFlag(),
        // @ts-expect-error - TS2322: To assign middlewares
        middlewares.processArgumentsAndDisplayHeader(),
        middlewares.initSystemFiles(),
      ],
      false, // applyBeforeValidate is false as otherwise middleware is called twice
    );

    // Expand the terminal width to the maximum available
    rootCmd.wrap(rootCmd.terminalWidth());

    rootCmd.fail((message, error): void => {
      if (message) {
        const usedHelpShorthand: boolean =
          rawArgs.includes('help') && !rawArgs.includes('--help') && !rawArgs.includes('-h');

        if (usedHelpShorthand) {
          rootCmd.showHelp((output): void => {
            helpRenderer.render(rootCmd, output);
          });
          throw new SilentBreak('Help shorthand displayed');
        }

        if (
          message.includes('Unknown argument') ||
          message.includes('Missing required argument') ||
          message.toLowerCase().includes('select')
        ) {
          if (message.toLowerCase().includes('select')) {
            // Show what subcommands are available then exit normally
            rootCmd.showHelp((output): void => {
              helpRenderer.render(rootCmd, output);
            });
            // Use SilentBreak to exit cleanly without error display
            throw new SilentBreak('No subcommand provided, help displayed');
          }

          // For unknown/missing arguments, show message and help
          logger.showUser(message);
          rootCmd.showHelp((output): void => {
            helpRenderer.render(rootCmd, output);
          });

          // Throw error to propagate through async call chains if given unknown argument
          if (!rootCmd.parsed.argv.help) {
            // Set exit code but don't exit immediately - allows I/O buffers to flush
            process.exitCode = 1;
            throw new SoloError(message, error);
          }
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
