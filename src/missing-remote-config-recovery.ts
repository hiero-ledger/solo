// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {container} from 'tsyringe-neo';
import {ArgumentProcessor} from './argument-processor.js';
import {Flags as flags} from './commands/flags.js';
import {
  argvPushGlobalFlags,
  newArgv,
  optionFromFlag,
  soloCommand as formatSoloCommand,
} from './commands/command-helpers.js';
import {SINGLE_DESTROY_COMMAND} from './commands/one-shot/one-shot-command-paths.js';
import {type ConfigManager} from './core/config-manager.js';
import {InjectTokens} from './core/dependency-injection/inject-tokens.js';
import {RemoteConfigMissingOnKindClusterError} from './core/errors/classes/config/remote-config-missing-on-kind-cluster-error.js';
import {UserBreak} from './core/errors/user-break.js';
import {type SoloLogger} from './core/logging/solo-logger.js';
import {type AnyObject} from './types/aliases.js';

/**
 * Wraps command execution so that a deployment whose remote config ConfigMap has gone missing on a
 * local kind cluster recovers instead of dead-ending. A kind cluster holds nothing worth preserving,
 * so the leftover state is torn down with `solo one-shot single destroy` and the original command is
 * run once more against the clean slate. Non-kind clusters never reach here: the runtime state only
 * raises {@link RemoteConfigMissingOnKindClusterError} for kind contexts and lets every other target
 * fail fast.
 */
export class MissingRemoteConfigRecovery {
  private static readonly MAX_CAUSE_DEPTH: number = 10;

  /**
   * Runs the command, and on a missing remote config against a kind cluster cleans up the leftover
   * state and runs it again. The retry goes straight to {@link ArgumentProcessor.process} rather than
   * back through this method, so a cleanup that does not resolve the problem fails out instead of
   * looping.
   */
  public static async processWithRecovery(argv: string[]): Promise<AnyObject> {
    try {
      return await ArgumentProcessor.process(argv);
    } catch (error) {
      const recoverable: RemoteConfigMissingOnKindClusterError | undefined =
        MissingRemoteConfigRecovery.findRecoverableError(error);

      if (!recoverable) {
        throw error;
      }

      const logger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

      if (!(await MissingRemoteConfigRecovery.confirmCleanup(recoverable, logger))) {
        throw new UserBreak('Aborted by user');
      }

      try {
        await MissingRemoteConfigRecovery.cleanUpLeftoverState(recoverable, logger);
      } catch (cleanupError) {
        logger.error('Failed to clean up the leftover state of the missing remote config', cleanupError);
        throw error;
      }

      logger.showUser(chalk.yellow('Leftover state cleaned up; running the command again'));
      return await ArgumentProcessor.process(argv);
    }
  }

  /**
   * Walks the error's `cause` chain looking for a missing remote config on a kind cluster. Commands
   * wrap failures in their own error classes (for example `oneShotDeployFailed`), so the recoverable
   * error is rarely the outermost one.
   */
  private static findRecoverableError(error: unknown): RemoteConfigMissingOnKindClusterError | undefined {
    let current: unknown = error;
    for (let depth: number = 0; current && depth < MissingRemoteConfigRecovery.MAX_CAUSE_DEPTH; depth++) {
      if (current instanceof RemoteConfigMissingOnKindClusterError) {
        return current;
      }
      current = (current as {cause?: unknown}).cause;
    }
    return undefined;
  }

  /**
   * Asks once before destroying anything. A non-interactive run (`--quiet`, `--force`, or no TTY to
   * prompt on) proceeds without asking, since a kind cluster has nothing to preserve.
   */
  private static async confirmCleanup(
    recoverable: RemoteConfigMissingOnKindClusterError,
    logger: SoloLogger,
  ): Promise<boolean> {
    logger.showUser(
      chalk.yellow(
        `\nThe remote config for deployment '${recoverable.deploymentName}' is missing from namespace ` +
          `'${recoverable.namespace}' on kind cluster context '${recoverable.context}'.`,
      ),
    );

    const configManager: ConfigManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
    const isQuiet: boolean = configManager.getFlag<boolean>(flags.quiet) === true;
    const isForced: boolean = configManager.getFlag<boolean>(flags.force) === true;

    if (isQuiet || isForced || !process.stdin.isTTY) {
      return true;
    }

    return await confirmPrompt({
      default: true,
      message:
        'Nothing is left to preserve on a local kind cluster, so solo can destroy the leftover state ' +
        `with '${formatSoloCommand(SINGLE_DESTROY_COMMAND)}' and run your command again. Continue?`,
    });
  }

  /**
   * Tears the leftover state down by re-entering the CLI with `solo one-shot single destroy`, which
   * already tolerates an absent remote config and removes the cluster-side resources, the cluster
   * reference, and the deployment entry in the local config.
   */
  private static async cleanUpLeftoverState(
    recoverable: RemoteConfigMissingOnKindClusterError,
    logger: SoloLogger,
  ): Promise<void> {
    const destroyArgv: string[] = newArgv();
    destroyArgv.push(
      ...SINGLE_DESTROY_COMMAND.split(' '),
      optionFromFlag(flags.deployment),
      recoverable.deploymentName,
      optionFromFlag(flags.quiet),
    );
    argvPushGlobalFlags(destroyArgv);

    logger.showUser(chalk.yellow(`Cleaning up leftover state: ${formatSoloCommand(SINGLE_DESTROY_COMMAND)}`));

    const configManager: ConfigManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
    await configManager.runWithScopedConfig(configManager.cloneActiveConfig(), async (): Promise<void> => {
      await ArgumentProcessor.process(destroyArgv);
    });
  }
}
