// SPDX-License-Identifier: Apache-2.0

import {ChildProcessWithoutNullStreams, spawn} from 'node:child_process';
import chalk from 'chalk';
import {type SoloLogger} from './logging/solo-logger.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {OperatingSystem} from '../business/utils/operating-system.js';
import {SensitiveDataRedactor} from './util/sensitive-data-redactor.js';
import {ExternalCommandExecutionOptions, ExternalCommandInvocation} from './execution/external-command-invocation.js';

@injectable()
export class ShellRunner {
  public constructor(@inject(InjectTokens.SoloLogger) public logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /**
   * Redacts sensitive arguments from a command array.
   * Delegates to the shared {@link SensitiveDataRedactor} utility.
   * @param arguments_ The arguments array to redact
   * @returns A new redacted arguments array
   */
  public static redactArguments(arguments_: string[]): string[] {
    return SensitiveDataRedactor.redactArguments(arguments_, {
      flagsToRedactNextArgument: ['--password', '-p'],
      setStyleFlags: ['--set', '--set-string', '--set-file'],
    });
  }
  /** Returns a promise that invokes an external command without shell interpretation. */
  public async runExternalCommand(
    invocation: ExternalCommandInvocation,
    options: ExternalCommandExecutionOptions = {},
  ): Promise<string[]> {
    const {commandPathOrName, commandArguments, environmentVariables = {}, workingDirectory} = invocation;

    const {verbose = false, detached = false, timeoutMs} = options;

    if (!commandPathOrName) {
      throw new Error('External command path or name is required');
    }

    const redactedArguments: string[] = ShellRunner.redactArguments(commandArguments);
    const message: string = `Executing external command${OperatingSystem.isWin32() ? ' (Windows)' : ''}: ${commandPathOrName} ${redactedArguments.join(' ')}`;
    const callStack: string = new Error(message).stack; // capture the callstack to be included in error

    this.logger.info(message);

    return new Promise<string[]>((resolve, reject): void => {
      const child: ChildProcessWithoutNullStreams = spawn(commandPathOrName, commandArguments, {
        env: {...process.env, ...environmentVariables},
        shell: false,
        detached,
        cwd: workingDirectory,
        stdio: detached ? 'ignore' : undefined,
        windowsHide: OperatingSystem.isWin32(), // hide the console window on Windows
      });

      if (detached) {
        child.unref(); // allow the parent process to exit independently of this child
        resolve([]);
        return;
      }

      let timedOut: boolean = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      if (timeoutMs !== undefined) {
        timeoutHandle = setTimeout((): void => {
          timedOut = true;
          child.kill();

          const error: Error = new Error(`External command timed out after ${timeoutMs}ms: '${commandPathOrName}'`);
          error.stack = callStack;

          reject(error);
        }, timeoutMs);
      }

      const output: string[] = [];
      child.stdout.on('data', (data): void => {
        const items: string[] = data.toString().split(/\r?\n/);

        for (const item of items) {
          if (item) {
            output.push(item);
          }
        }
      });

      const errorOutput: string[] = [];
      child.stderr.on('data', (data): void => {
        const items: string[] = data.toString().split(/\r?\n/);

        for (const item of items) {
          if (item) {
            errorOutput.push(item.trim());
          }
        }
      });

      child.on('error', (error): void => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        error.stack = callStack;
        reject(error);
      });

      child.on('exit', (code, signal): void => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        if (timedOut) {
          return; // already rejected by timeout handler
        }

        if (code) {
          const error: Error = new Error(
            `External command exited with error code ${code}, [command: '${commandPathOrName}'], [message: '${errorOutput.join('\n')}']`,
          );

          // include the callStack to the parent runExternalCommand() instead of from inside this handler.
          // this is needed to ensure we capture the proper callstack for easier debugging.
          error.stack = callStack;

          if (verbose) {
            for (const message of errorOutput) {
              this.logger.showUser(chalk.red(message));
            }
          }

          this.logger.error(`Error executing external command: '${commandPathOrName}'`, {
            commandExitCode: code,
            commandExitSignal: signal,
            commandOutput: output,
            errOutput: errorOutput,
            error: {
              message: error.message,
              stack: error.stack,
            },
          });

          reject(error);
          return;
        }

        this.logger.debug(
          `Finished executing external command: '${commandPathOrName}', ${JSON.stringify({
            commandExitCode: code,
            commandExitSignal: signal,
            commandOutput: output,
            errOutput: errorOutput,
          })}`,
        );

        resolve(output);
      });
    });
  }

  public async sudoRun(
    sudoRequested: (message: string) => void,
    sudoGranted: (message: string) => void,
    invocation: ExternalCommandInvocation,
    options: ExternalCommandExecutionOptions = {},
  ): Promise<string[]> {
    // Use Promise.race to handle sudo whoami and timeout
    let whoamiResolved: boolean = false;

    const whoamiPromise: Promise<string[]> = this.runExternalCommand({
      commandPathOrName: 'sudo',
      commandArguments: ['whoami'],
    }).then(async (result): Promise<string[]> => {
      whoamiResolved = true;
      sudoGranted('Root access granted.');
      return result;
    });

    // eslint-disable-next-line no-async-promise-executor
    const timeoutPromise: Promise<string[]> = new Promise<string[]>(async (resolve): Promise<void> => {
      await new Promise((callback): NodeJS.Timeout => setTimeout(callback, 500));

      if (!whoamiResolved) {
        sudoRequested('Please provide root permissions to proceed...');
      }

      resolve([]);
    });

    await Promise.race([whoamiPromise, timeoutPromise]);

    const environmentArguments: string[] = Object.entries(invocation.environmentVariables ?? {}).map(
      ([key, value]): string => `${key}=${value}`,
    );

    return this.runExternalCommand(
      {
        commandPathOrName: 'sudo',
        commandArguments: [
          'env',
          ...environmentArguments,
          invocation.commandPathOrName,
          ...invocation.commandArguments,
        ],
        workingDirectory: invocation.workingDirectory,
      },
      options,
    );
  }
}
