// SPDX-License-Identifier: Apache-2.0

/**
 * Persistently port-forward a local port to a port on a Kubernetes pod.
 * This solves an issue where a detatched port-forward can be terminated by network issues.
 * Usage: persist-port-forward <namespace> <pod> <port_map> [context]
 * Note: The last parameter has to be <port_map>, and it needs to be in the format <local>:<remote>.
 * This ensures compatibility with existing K8ClientPod port forwarding logic.
 */

import {spawn, type ChildProcess} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// eslint-disable-next-line unicorn/no-unreadable-array-destructuring
const [, , NAMESPACE, POD, CONTEXT, PORT_MAP, KUBECTL_EXECUTABLE] = process.argv;

if (!NAMESPACE || !POD || !PORT_MAP) {
  console.error('Usage: persist-port-forward <namespace> <pod> <local> <remote> [context]');
  // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
  process.exit(2);
}

const MIN_BACKOFF: number = 1; // seconds
const MAX_BACKOFF: number = 60; // seconds
let backoff: number = MIN_BACKOFF;
let child: ChildProcess | undefined;
let stopping: boolean = false;

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ExecuteKubectlOptions {
  captureOutput: boolean;
  trackAsChild: boolean;
}

function isTerminalKubectlError(message: string): boolean {
  const errorText: string = message.toLowerCase();

  return (
    (errorText.includes('context') && errorText.includes('does not exist')) ||
    (errorText.includes('connection to the server') && errorText.includes('was refused')) ||
    errorText.includes('unable to connect to the server') ||
    errorText.includes('no configuration has been provided') ||
    errorText.includes('no such host') ||
    (errorText.includes('not found') &&
      (errorText.includes('namespaces') || errorText.includes('pods') || errorText.includes('pod')))
  );
}

function prepareCommandForPlatform(
  command: string,
  commandArguments: string[],
): {command: string; arguments_: string[]} {
  if (os.platform() !== 'win32') {
    return {command, arguments_: commandArguments};
  }

  const argumentsLength: number = commandArguments.length;
  const quotedArguments: string[] = commandArguments.map((anArgument, index): string => {
    if (index < argumentsLength - 1) {
      return `"${anArgument}",`;
    }
    return `"${anArgument}"`;
  });

  return {
    command: 'powershell.exe',
    arguments_: [
      'Start-Process',
      '-FilePath',
      `"${command}"`,
      '-WindowStyle',
      'Hidden',
      '-ArgumentList',
      ...quotedArguments,
    ],
  };
}

async function executeKubectl(
  commandArguments: string[],
  kubectlInstallationDirectory: string,
  options: ExecuteKubectlOptions,
): Promise<CommandResult> {
  return await new Promise((resolve): void => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const initialCommand: string = KUBECTL_EXECUTABLE || 'kubectl';
    const commandInfo: {command: string; arguments_: string[]} = prepareCommandForPlatform(initialCommand, [
      ...commandArguments,
    ]);

    const kubectlProcess: ChildProcess = spawn(commandInfo.command, commandInfo.arguments_, {
      env: {...process.env, PATH: `${kubectlInstallationDirectory}${path.delimiter}${process.env.PATH}`},
      stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: os.platform() === 'win32',
    });

    if (options.trackAsChild) {
      child = kubectlProcess;
    }

    kubectlProcess.stdout?.on('data', (chunk: Buffer): void => {
      stdoutChunks.push(chunk.toString());
    });
    kubectlProcess.stderr?.on('data', (chunk: Buffer): void => {
      stderrChunks.push(chunk.toString());
    });

    kubectlProcess.on('error', (error): void => {
      resolve({
        code: 1,
        stdout: stdoutChunks.join(''),
        stderr: `${stderrChunks.join('')}\n${String(error)}`,
      });
    });

    kubectlProcess.on('close', (code): void => {
      if (options.trackAsChild && child?.pid === kubectlProcess.pid) {
        child = undefined;
      }

      resolve({
        code: typeof code === 'number' ? code : 0,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
      });
    });
  });
}

/**
 * Check if a cluster or name space is still available, should restart the portfolio process or exit
 */
async function shouldExitForMissingTarget(kubectlInstallationDirectory: string): Promise<boolean> {
  const baseArguments: string[] = CONTEXT ? ['--context', CONTEXT] : [];

  // Namespace existence is a stable signal that the cluster/context is still reachable.
  const namespaceResult: CommandResult = await executeKubectl(
    [...baseArguments, 'get', 'namespace', NAMESPACE, '-o', 'name'],
    kubectlInstallationDirectory,
    {captureOutput: true, trackAsChild: false},
  );

  if (namespaceResult.code !== 0) {
    const combinedNamespaceError: string = `${namespaceResult.stderr}\n${namespaceResult.stdout}`.trim();
    if (isTerminalKubectlError(combinedNamespaceError)) {
      console.error(
        `Stopping persistent port-forward: namespace/context is unavailable (${combinedNamespaceError || 'unknown kubectl error'})`,
      );
      return true;
    }
  }

  // Pod absence after cluster teardown/deployment destroy is terminal for this specific forward.
  const podResult: CommandResult = await executeKubectl(
    [...baseArguments, '-n', NAMESPACE, 'get', POD, '-o', 'name'],
    kubectlInstallationDirectory,
    {captureOutput: true, trackAsChild: false},
  );
  if (podResult.code !== 0) {
    const combinedPodError: string = `${podResult.stderr}\n${podResult.stdout}`.trim();
    if (isTerminalKubectlError(combinedPodError)) {
      console.error(
        `Stopping persistent port-forward: pod target is unavailable (${combinedPodError || 'unknown kubectl error'})`,
      );
      return true;
    }
  }

  return false;
}

function runKubectl(kubectlInstallationDirectory: string): Promise<number> {
  const arguments_: string[] = ['port-forward', '-n', NAMESPACE];
  if (CONTEXT) {
    arguments_.push('--context', CONTEXT);
  }
  const [LOCAL, REMOTE] = PORT_MAP.split(':');
  arguments_.push(POD, `${LOCAL}:${REMOTE}`);

  console.error(`Starting kubectl ${arguments_.join(' ')}`);

  return executeKubectl(arguments_, kubectlInstallationDirectory, {captureOutput: false, trackAsChild: true}).then(
    (result: CommandResult): number => {
      if (result.code !== 0) {
        console.error('Failed to start kubectl:', result.stderr || `exit code ${result.code}`);
      }
      return result.code;
    },
  );
}

function sleepSeconds(s: number): Promise<void> {
  // eslint-disable-next-line unicorn/prevent-abbreviations
  return new Promise((res): NodeJS.Timeout => setTimeout(res, s * 1000));
}

async function main(): Promise<void> {
  const kubectlInstallationDirectory: string = process.argv[7] || '';
  while (!stopping) {
    if (await shouldExitForMissingTarget(kubectlInstallationDirectory)) {
      break;
    }

    const rc: number = await runKubectl(kubectlInstallationDirectory);
    if (stopping) {
      break;
    }
    console.error(`kubectl exited with code ${rc}, restarting in ${backoff} seconds`);
    await sleepSeconds(backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
  }
}

function shutdown(signal: string): void {
  stopping = true;
  console.error(`Received ${signal}, shutting down`);
  if (child) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  // give processes a moment to terminate gracefully
  // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
  setTimeout((): never => process.exit(0), 500);
}

process.on('SIGINT', (): void => shutdown('SIGINT'));
process.on('SIGTERM', (): void => shutdown('SIGTERM'));

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((error): never => {
  console.error('Unhandled error in persist-port-forward:', error);
  // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
  process.exit(1);
});
