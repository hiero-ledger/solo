// SPDX-License-Identifier: Apache-2.0

import {ShellRunner} from './shell-runner.js';
import chalk from 'chalk';
import {SoloError} from './errors/solo-error.js';
import {type SoloLogger} from './logging/solo-logger.js';

const SOLO_PACKAGES_TO_UNLINK: string[] = ['@hashgraph/solo', '@hiero-ledger/solo'];

export async function detectGlobalLinkedSoloPackages(logger: SoloLogger): Promise<string[]> {
  const shellRunner: ShellRunner = new ShellRunner(logger);

  try {
    const listResult: string[] = await shellRunner.run('npm list --global --depth=0');
    const foundLinkedPackages: string[] = [];

    for (const item of listResult) {
      // Check if any of the globally linked packages match the SOLO_PACKAGES_TO_UNLINK
      // and unlink them if they point to a local directory (indicated by '->' in the npm list output)
      const matchesSoloPackages: string[] = SOLO_PACKAGES_TO_UNLINK.filter(
        (soloPackage: string): boolean => item.includes(soloPackage) && item.includes('->'),
      );
      for (const packageName of matchesSoloPackages) {
        try {
          const logMessage: string = `Found locally linked installation of ${packageName}.`;
          logger.showUser(chalk.yellow(logMessage));
          logger.info(logMessage);
          foundLinkedPackages.push(packageName);
        } catch (error: Error | unknown) {
          logger.error(
            new SoloError(
              `Failed to parse npm list output line "${item}". Please check for any globally linked Solo packages and unlink them manually using "npm unlink -g <package-name>".`,
              error,
            ),
          );
        }
      }
    }

    return foundLinkedPackages;
  } catch (error: Error | unknown) {
    logger.warn(
      new SoloError(
        'Failed to detect globally linked Solo packages. Please check for any globally linked Solo packages and' +
          ' unlink them manually using "npm unlink -g <package-name>".',
        error,
      ),
    );
    return [];
  }
}

export async function unlinkLocalSoloPackages(logger: SoloLogger): Promise<void> {
  const shellRunner: ShellRunner = new ShellRunner(logger);
  const linkedPackages: string[] = await detectGlobalLinkedSoloPackages(logger);

  for (const packageName of linkedPackages) {
    logger.debug(`Unlinking earlier global installation of ${packageName}`);
    try {
      const unlinkOutput: string[] = await shellRunner.run(`npm unlink -g ${packageName}`);
      for (const line of unlinkOutput) {
        logger.showUser(`npm unlink: ${chalk.yellow(line)}`);
        logger.info(`npm unlink: ${line}`);
      }
      logger.debug(`Successfully unlinked ${packageName}`);
    } catch (error: Error | unknown) {
      logger.error(
        new SoloError(
          `Failed to unlink earlier global installation of ${packageName}. Please manually run "npm unlink -g ${packageName}" to unlink.`,
          error,
        ),
      );
    }
  }
}
