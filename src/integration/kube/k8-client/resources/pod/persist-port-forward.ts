// SPDX-License-Identifier: Apache-2.0

/**
 * Persistently port-forward a local port to a port on a Kubernetes pod.
 * This solves an issue where a detatched port-forward can be terminated by network issues.
 * Usage: persist-port-forward <namespace> <pod> <port_map> [context]
 * Note: The last parameter has to be <port_map>, and it needs to be in the format <local>:<remote>.
 * This ensures compatibility with existing K8ClientPod port forwarding logic.
 */

import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';

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
let child: ChildProcessWithoutNullStreams | null = null;
let stopping: boolean = false;

function runKubectl(): Promise<number> {
  return new Promise((resolve): void => {
    const arguments_: string[] = ['port-forward', '-n', NAMESPACE];
    if (CONTEXT) {
      arguments_.push('--context', CONTEXT);
    }
    const [LOCAL, REMOTE] = PORT_MAP.split(':');
    arguments_.push(POD, `${LOCAL}:${REMOTE}`);

    console.error(`Starting kubectl ${arguments_.join(' ')}`);

    child = spawn(KUBECTL_EXECUTABLE, arguments_, {stdio: 'inherit'});

    child.on('error', (error): void => {
      console.error('Failed to start kubectl:', error);
      // Treat spawn error like non-zero exit so we will backoff and retry
      resolve(1);
    });

    child.on('close', (code): void => {
      // Ensure child reference cleared
      child = null;
      resolve(typeof code === 'number' ? code : 0);
    });
  });
}

function sleepSeconds(s: number): Promise<void> {
  // eslint-disable-next-line unicorn/prevent-abbreviations
  return new Promise((res): NodeJS.Timeout => setTimeout(res, s * 1000));
}

async function main(): Promise<void> {
  while (!stopping) {
    const rc: number = await runKubectl();
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
