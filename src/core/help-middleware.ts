// SPDX-License-Identifier: Apache-2.0

/**
 * Global middleware to handle help flags for all commands and subcommands
 * This ensures that when --help is used with any command, the help information
 * is displayed properly without requiring arguments that would normally be required
 */
export function applyHelpMiddleware(yargs: any): any {
  // Check for help early in the process, before yargs validation
  const isHelpRequested = process.argv.some(argument => argument === '--help' || argument === '-h');

  if (isHelpRequested) {
    // Add a middleware that runs before validation to catch help requests
    yargs.middleware((argv: any) => {
      if (argv.help || argv.h) {
        yargs.showHelp();
        process.exit(0);
      }
    }, true); // applyBeforeValidation = true
  }

  // Store the original fail function
  const originalFail = yargs.fail;

  // Override the fail function to handle help requests specially
  yargs.fail((message: string, error: Error, yargs: any) => {
    // Check if help was requested in the command line arguments
    const isHelpRequested = process.argv.some(
      argument => argument === '--help' || argument === '-h' || argument === 'help',
    );

    // If this is a help request, don't treat missing required args as errors
    if (isHelpRequested) {
      // Just show help without error
      yargs.showHelp();
      process.exit(0);
    }

    // Also check the parsed argv if available
    if (yargs.parsed && yargs.parsed.argv && (yargs.parsed.argv.help || yargs.parsed.argv.h)) {
      // Just show help without error
      yargs.showHelp();
      process.exit(0);
    }

    // If the message is about missing required arguments but help might be intended
    // This is a fallback for edge cases
    if (message && message.includes('Missing required argument') && isHelpRequested) {
      // Show help instead of error
      yargs.showHelp();
      process.exit(0);
    }

    // Otherwise, use the original fail handler
    if (originalFail) {
      return originalFail(message, error, yargs);
    }
  });

  return yargs;
}
