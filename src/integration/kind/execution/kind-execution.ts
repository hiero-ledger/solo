// SPDX-License-Identifier: Apache-2.0

import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {KindExecutionException} from '../errors/kind-execution-exception.js';
import {KindParserException} from '../errors/kind-parser-exception.js';
import {type Duration} from '../../../core/time/duration.js';

/**
 * Represents the execution of a kind command and is responsible for parsing the response.
 */
export class KindExecution {
  /**
   * The message for a timeout error.
   */
  private static readonly MSG_TIMEOUT_ERROR = 'Timed out waiting for the process to complete';
  /**
   * The message for an error deserializing the output into a specified class.
   */
  private static readonly MSG_DESERIALIZATION_ERROR = 'Failed to deserialize the output into the specified class: %s';
  /**
   * The message for an error reading the output from the process.
   */
  private static readonly MSG_READ_OUTPUT_ERROR = 'Failed to read the output from the process';
  /**
   * The message for a deserialization error.
   */
  private static readonly MSG_LIST_DESERIALIZATION_ERROR =
    'Failed to deserialize the output into a list of the specified class: %s';

  private readonly process: ChildProcessWithoutNullStreams;

  private output: string[] = [];
  private errOutput: string[] = [];
  private exitCodeValue: number | null = null;

  /**
   * Creates a new KindExecution instance.
   * @param command The command array to execute
   * @param environmentVariables The environment variables to set
   */
  public constructor(command: string[], environmentVariables: Record<string, string>) {
    this.process = spawn(command.join(' '), {
      shell: true,
      env: {...process.env, ...environmentVariables},
    });
  }

  /**
   * Waits for the process to complete.
   * @returns A promise that resolves when the process completes
   */
  async waitFor(): Promise<void> {
    return new Promise((resolve, reject) => {
      // const output: string[] = [];
      this.process.stdout.on('data', d => {
        const items: string[] = d.toString().split(/\r?\n/);
        for (const item of items) {
          if (item) {
            this.output.push(item);
          }
        }
      });

      this.process.stderr.on('data', d => {
        const items: string[] = d.toString().split(/\r?\n/);
        for (const item of items) {
          if (item) {
            this.errOutput.push(item.trim());
          }
        }
      });

      this.process.on('close', code => {
        this.exitCodeValue = code;
        if (code === 0) {
          resolve();
        } else {
          reject(
            new KindExecutionException(
              code || 1,
              `Process exited with code ${code}: ${this.standardError()}`,
              this.standardOutput(),
              this.standardError(),
            ),
          );
        }
      });
    });
  }

  /**
   * Waits for the process to complete with a timeout.
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with true if the process completed, or false if it timed out
   */
  async waitForTimeout(timeout: Duration): Promise<boolean> {
    const timeoutPromise = new Promise<boolean>(resolve => {
      setTimeout(() => resolve(false), timeout.toMillis());
    });

    const successPromise = new Promise<boolean>(resolve => {
      this.process.on('close', code => {
        resolve(code === 0);
      });
    });

    return Promise.race([successPromise, timeoutPromise]);
  }

  /**
   * Gets the exit code of the process.
   * @returns The exit code or null if the process hasn't completed
   */
  exitCode(): number | null {
    return this.exitCodeValue;
  }

  /**
   * Gets the standard output of the process.
   * @returns concatenated standard output as a string
   */
  standardOutput(): string {
    return this.output.join('\n');
  }

  /**
   * Gets the standard error of the process.
   * @returns concatenated standard error as a string
   */
  standardError(): string {
    return this.errOutput.join('\n');
  }

  /**
   * Gets the response as a parsed object.
   * @param responseClass The class to parse the response into
   * @returns A promise that resolves with the parsed response
   */
  async responseAs<T>(responseClass: new (...arguments_: any[]) => T): Promise<T> {
    return this.responseAsTimeout(responseClass, null);
  }

  /**
   * Gets the response as a parsed object with a timeout.
   * @param responseClass The class to parse the response into
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with the parsed response or rejects on timeout
   */
  async responseAsTimeout<T>(responseClass: new (...arguments_: any[]) => T, timeout: Duration | null): Promise<T> {
    if (timeout === null) {
      await this.waitFor();
    } else {
      const success = await this.waitForTimeout(timeout);
      if (!success) {
        throw new KindParserException(KindExecution.MSG_TIMEOUT_ERROR);
      }
    }

    const exitCode = this.exitCode();
    if (exitCode !== 0) {
      const stdOut = this.standardOutput();
      const stdError = this.standardError();
      throw new KindExecutionException(exitCode, `Process exited with code ${exitCode}`, stdOut, stdError);
    }
    if (responseClass === undefined) {
      return null;
    }

    const stdOut = this.standardOutput();

    // Kind outputs to stdErr, so when the exit code is 0, we can assume stdErr is the expected output logs.
    const stdLogs: string = this.standardError();

    // If both stdOut and stdLogs are empty, we throw an error.
    const output = stdOut || stdLogs;
    if (!output) {
      throw new KindParserException(KindExecution.MSG_READ_OUTPUT_ERROR);
    }

    try {
      const parsed = output.split(/\r?\n/).filter(line => line.trim() !== '');
      const result = new responseClass(...parsed);
      return result;
    } catch {
      throw new KindParserException(KindExecution.MSG_DESERIALIZATION_ERROR.replace('%s', responseClass.name));
    }
  }

  /**
   * Gets the response as a list of parsed objects.
   * @param responseClass The class to parse each item in the response into
   * @returns A promise that resolves with the parsed response list
   */
  async responseAsList<T>(responseClass: new (...arguments_: any[]) => T): Promise<T[]> {
    return this.responseAsListTimeout(responseClass, null);
  }

  /**
   * Gets the response as a list of parsed objects with a timeout.
   * @param responseClass The class to parse each item in the response into
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves with the parsed response list or rejects on timeout
   */
  async responseAsListTimeout<T>(
    responseClass: new (...arguments_: any[]) => T,
    timeout: Duration | null,
  ): Promise<T[]> {
    if (timeout === null) {
      await this.waitFor();
    } else {
      const success = await this.waitForTimeout(timeout);
      if (!success) {
        throw new KindParserException(KindExecution.MSG_TIMEOUT_ERROR);
      }
    }

    const exitCode = this.exitCode();
    if (exitCode !== 0) {
      const stdOut = this.standardOutput();
      const stdError = this.standardError();
      throw new KindExecutionException(exitCode, `Process exited with code ${exitCode}`, stdOut, stdError);
    }

    const output = this.standardOutput();
    try {
      const splitOutput = output.split(/\r?\n/).filter(line => line.trim() !== '');
      return splitOutput.map(line => new responseClass(...line.split(',')));
    } catch {
      throw new KindParserException(KindExecution.MSG_LIST_DESERIALIZATION_ERROR.replace('%s', responseClass.name));
    }
  }

  /**
   * Executes the command and waits for completion.
   * @returns A promise that resolves when the command completes
   */
  async call(): Promise<void> {
    await this.callTimeout(null);
  }

  /**
   * Executes the command and waits for completion with a timeout.
   * @param timeout The maximum time to wait, or null to wait indefinitely
   * @returns A promise that resolves when the command completes or rejects on timeout
   */
  async callTimeout(timeout: Duration | null): Promise<void> {
    if (timeout === null) {
      await this.waitFor();
    } else {
      const success = await this.waitForTimeout(timeout);
      if (!success) {
        throw new KindParserException(KindExecution.MSG_TIMEOUT_ERROR);
      }
    }

    const exitCode = this.exitCode();
    if (exitCode !== 0) {
      const stdOut = await this.standardOutput();
      const stdError = await this.standardError();
      throw new KindExecutionException(exitCode, `Process exited with code ${exitCode}`, stdOut, stdError);
    }
  }
}
