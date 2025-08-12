// SPDX-License-Identifier: Apache-2.0

import {type HelpRenderer} from './help-renderer.js';

/**
 * Global middleware to handle help flags for all commands and subcommands
 * This ensures that when --help is used with any command, the help information
 * is displayed properly without requiring arguments that would normally be required
 */
export function applyHelpMiddleware(yargs: any, helpRenderer?: HelpRenderer): any {
  // Helper function to check if help was requested
  const isHelpRequested = () => process.argv.some(argument => argument === '--help' || argument === '-h');

  // Add middleware that runs before validation to catch explicit help requests
  if (isHelpRequested()) {
    yargs.middleware((argv: any) => {
      if (argv.help || argv.h) {
        if (helpRenderer) {
          // Use custom help renderer for consistent formatting
          yargs.showHelp((output: string) => {
            helpRenderer.render(yargs, output);
          });
        } else {
          // Fallback to default help
          yargs.showHelp();
        }
        process.exit(0);
      }
    }, true); // applyBeforeValidation = true
  }

  return yargs;
}
