// SPDX-License-Identifier: Apache-2.0

import {spawn} from 'node:child_process';
import chalk from 'chalk';
import * as Base64 from 'js-base64';

/**
 * Run a shell command, preserving colors for interactive Solo CLI commands,
 * otherwise using normal spawn for safety.
 * @returns - The output of the command.
 */
export async function run(cmd: string, opts = {}): Promise<string> {
  console.log(chalk.green(cmd));

  // Normal spawn for non-interactive commands
  const [command, ...args] = cmd.split(' ');
  return new Promise((resolve, reject) => {
    const env = {...process.env};
    if (!env.PATH) env.PATH = '/usr/local/bin:/usr/bin:/bin';

    const child = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
      env,
      ...opts,
    });

    let output = '';
    child.stdout.on('data', data => {
      const text = data.toString();
      process.stdout.write(text);
      output += text.replace(/\r/g, '');
    });
    child.stderr.on('data', data => {
      const text = data.toString();
      process.stderr.write(text);
      output += text.replace(/\r/g, '');
    });

    child.on('close', code => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`Command failed: ${cmd} (exit code ${code})`));
    });
  });
}

/**
 * Run a command and capture its stdout as a string.
 * @param cmd - Command to execute (can include arguments)
 * @param opts - Optional spawn options
 * @param returnBase64 - If true, returns the output as a base64-encoded string
 * @returns - Resolves to the stdout output
 */
export async function runCapture(cmd: string, opts = {}, returnBase64: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = {...process.env};
    if (!env.PATH) env.PATH = '/usr/local/bin:/usr/bin:/bin';

    // const child = spawn(command, args, {
    const child = spawn(cmd, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      cwd: process.cwd(),
      env,
      ...opts,
    });

    let output = '';

    child.stdout.on('data', data => {
      output += data.toString().replace(/\r/g, '');
    });

    child.stderr.on('data', data => {
      output += data.toString().replace(/\r/g, '');
    });

    child.on('close', code => {
      if (code === 0) resolve(returnBase64 ? Base64.encode(output.trim()) : output.trim());
      else reject(new Error(`Command failed: ${cmd} (exit code ${code})`));
    });
  });
}
