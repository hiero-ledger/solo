// SPDX-License-Identifier: Apache-2.0

import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import chalk from 'chalk';

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
 * Run a command, capture output, save to log file, and export env var.
 */
export async function runAndSave(cmd: string, key: string, logFile: string): Promise<string> {
  console.log(`beginning runAndSave for '${cmd}'`);
  const output = await run(cmd);
  writeFileSync(logFile, output + '\n');
  process.env[key] = output;
  console.log(`ended runAndSave for '${cmd}', output saved to ${logFile}`);
  return output;
}

/**
 * Run a command and capture its stdout as a string.
 * @param cmd - Command to execute (can include arguments)
 * @param opts - Optional spawn options
 * @returns - Resolves to the stdout output
 */
export async function runCapture(cmd: string, opts = {}): Promise<string> {
  // const [command, ...args] = cmd.split(' ');

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
      if (code === 0) resolve(output.trim());
      else reject(new Error(`Command failed: ${cmd} (exit code ${code})`));
    });
  });
}

/**
 * Perform variable substitution in a template string, replacing `$VAR` with its value.
 *
 * @param template - The template string containing placeholders like `$VAR`.
 * @param vars - A mapping of variable names to their replacement values.
 * @returns - The template with variables substituted.
 */
export function envsubst(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    const regex = new RegExp(`\\$${key}`, 'g');
    result = result.replace(regex, val || '');
  }
  return result;
}
