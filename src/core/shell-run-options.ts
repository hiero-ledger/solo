// SPDX-License-Identifier: Apache-2.0

/**
 * Optional settings for {@link ShellRunner.run}, modeled loosely on Node's `SpawnOptions`. Grouping the
 * less-common, mostly-defaulted parameters into an options object avoids threading positional
 * `undefined`/`false` values through a long signature just to reach a single trailing argument.
 */
export interface ShellRunOptions {
  /** Echo command output to the user as it is produced. Defaults to false. */
  verbose?: boolean;
  /** Spawn the process detached from the parent. Defaults to false. */
  detached?: boolean;
  /** Extra environment variables merged on top of `process.env`. Defaults to {}. */
  environmentVariablesToAppend?: Record<string, string>;
  /** Hard timeout in milliseconds for the whole command. */
  timeoutMs?: number;
  /** Run the command through a shell. Defaults to false. */
  useShell?: boolean;
  /** Timeout in milliseconds after which the command is killed if it produces no output. */
  idleTimeoutMs?: number;
  /** Working directory (cwd) for the spawned process. */
  workingDirectory?: string;
}
