// SPDX-License-Identifier: Apache-2.0

/**
 * Persistently port-forward a local port to a port on a Kubernetes pod.
 * This solves an issue where a detached port-forward can be terminated by network issues.
 * Usage: persist-port-forward <namespace> <pod> <context> <port_map> [kubectl_executable] [kubectl_installation_dir]
 * Note: <port_map> needs to be in the format <local>:<remote>.
 */

import {spawn, type ChildProcess} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// eslint-disable-next-line unicorn/no-unreadable-array-destructuring
const [, , NAMESPACE, POD, CONTEXT, PORT_MAP, KUBECTL_EXECUTABLE, KUBECTL_INSTALLATION_DIRECTORY] = process.argv;

if (!NAMESPACE || !POD || !CONTEXT || !PORT_MAP) {
  console.error(
    'Usage: persist-port-forward <namespace> <pod> <context> <port_map> [kubectl_executable] [kubectl_installation_dir]',
  );
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

async function executeKubectl(
  commandArguments: string[],
  kubectlInstallationDirectory: string,
  options: ExecuteKubectlOptions,
): Promise<CommandResult> {
  return await new Promise((resolve): void => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const kubectlCommand: string = KUBECTL_EXECUTABLE || 'kubectl';

    const kubectlProcess: ChildProcess = spawn(kubectlCommand, commandArguments, {
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

    kubectlProcess.on('close', (code, signal): void => {
      if (options.trackAsChild && child?.pid === kubectlProcess.pid) {
        child = undefined;
      }

      const stderrOutput: string = stderrChunks.join('');
      const signalMessage: string = signal ? `\nProcess terminated by signal: ${signal}` : '';
      let exitCode: number = 1;
      if (typeof code === 'number') {
        exitCode = code;
      } else if (stopping && (signal === 'SIGTERM' || signal === 'SIGINT')) {
        exitCode = 0;
      }

      resolve({
        code: exitCode,
        stdout: stdoutChunks.join(''),
        stderr: `${stderrOutput}${signalMessage}`,
      });
    });
  });
}

/**
 * Check if a cluster or namespace is still available, and whether to restart the port-forward process or exit.
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
  const kubectlInstallationDirectory: string = KUBECTL_INSTALLATION_DIRECTORY || '';
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
