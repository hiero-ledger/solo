// SPDX-License-Identifier: Apache-2.0

import {ChildProcessWithoutNullStreams, spawn} from 'node:child_process';
import chalk from 'chalk';
import {type SoloLogger} from './logging/solo-logger.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {OperatingSystem} from '../business/utils/operating-system.js';

@injectable()
export class ShellRunner {
  public constructor(@inject(InjectTokens.SoloLogger) public logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /** Returns a promise that invokes the shell command */
  public async run(
    cmd: string,
    arguments_: string[] = [],
    verbose: boolean = false,
    detached: boolean = false,
  ): Promise<string[]> {
    const message: string = `Executing command${OperatingSystem.isWin32() ? ' (Windows)' : ''}: '${cmd}' ${arguments_.join(' ')}`;
    const callStack: string = new Error(message).stack; // capture the callstack to be included in error
    this.logger.info(message);

    return new Promise<string[]>((resolve, reject): void => {
      const child: ChildProcessWithoutNullStreams = spawn(cmd, arguments_, {
        shell: true,
        detached,
        stdio: detached ? 'ignore' : undefined,
        windowsVerbatimArguments: OperatingSystem.isWin32(), // ensure arguments are passed verbatim on Windows
        windowsHide: OperatingSystem.isWin32(), // hide the console window on Windows
      });

      if (detached) {
        child.unref(); // allow the parent process to exit independently of this child
        resolve([]);
        return;
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

      child.on('exit', (code, signal): void => {
        if (code) {
          const error: Error = new Error(
            `Command exit with error code ${code}, [command: '${cmd}'], [message: '${errorOutput.join('\n')}']`,
          );

          // include the callStack to the parent run() instead of from inside this handler.
          // this is needed to ensure we capture the proper callstack for easier debugging.
          error.stack = callStack;

          if (verbose) {
            for (const m of errorOutput) {
              this.logger.showUser(chalk.red(m));
            }
          }

          this.logger.error(`Error executing: '${cmd}'`, {
            commandExitCode: code,
            commandExitSignal: signal,
            commandOutput: output,
            errOutput: errorOutput,
            error: {message: error.message, stack: error.stack},
          });

          reject(error);
        }

        this.logger.debug(
          `Finished executing: '${cmd}', ${JSON.stringify({
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
    cmd: string,
    arguments_: string[] = [],
    verbose: boolean = false,
    detached: boolean = false,
  ): Promise<string[]> {
    // Use Promise.race to handle sudo whoami and timeout
    let whoamiResolved: boolean = false;
    const whoamiPromise: Promise<string[]> = this.run('sudo whoami').then(async result => {
      whoamiResolved = true;
      sudoGranted('Root access granted.');
      return result;
    });
    // eslint-disable-next-line no-async-promise-executor
    const timeoutPromise = new Promise<string[]>(async resolve => {
      await new Promise(callback => setTimeout(callback, 500));
      if (!whoamiResolved) {
        sudoRequested('Please provide root permissions to proceed...');
      }
      resolve([]);
    });
    await Promise.race([whoamiPromise, timeoutPromise]);

    return this.run(`sudo ${cmd}`, arguments_, verbose, detached);
  }
}
