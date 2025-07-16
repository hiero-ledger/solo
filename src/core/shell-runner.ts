// SPDX-License-Identifier: Apache-2.0

import {ChildProcessWithoutNullStreams, spawn} from 'node:child_process';
import chalk from 'chalk';
import {type SoloLogger} from './logging/solo-logger.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';

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
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;
    const callStack: string = new Error('INFO').stack; // capture the callstack to be included in error
    self.logger.info(`Executing command: '${cmd}'`);

    return new Promise<string[]>((resolve, reject): void => {
      const child: ChildProcessWithoutNullStreams = spawn(cmd, arguments_, {
        shell: true,
        detached,
        stdio: detached ? 'ignore' : undefined,
      });

      if (detached) {
        child.unref(); // allow the parent process to exit independently of this child
        resolve([]);
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
          const error: Error = new Error(`Command exit with error code ${code}: ${cmd}`);

          // include the callStack to the parent run() instead of from inside this handler.
          // this is needed to ensure we capture the proper callstack for easier debugging.
          error.stack = callStack;

          if (verbose) {
            for (const m of errorOutput) {
              self.logger.showUser(chalk.red(m));
            }
          }

          self.logger.error(`Error executing: '${cmd}'`, {
            commandExitCode: code,
            commandExitSignal: signal,
            commandOutput: output,
            errOutput: errorOutput,
            error: {message: error.message, stack: error.stack},
          });

          reject(error);
        }

        self.logger.debug(`Finished executing: '${cmd}'`, {
          commandExitCode: code,
          commandExitSignal: signal,
          commandOutput: output,
          errOutput: errorOutput,
        });
        resolve(output);
      });
    });
  }
}
