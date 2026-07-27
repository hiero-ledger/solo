// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview JDWP Tester - Standalone script for testing JDWP debug connections
 *
 * This script continuously attempts JDWP handshakes and resume commands
 * until successful or timeout. It's used to verify that debug port forwarding
 * is working and can resume suspended JVMs.
 */

import {Socket} from 'node:net';
import {existsSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {argv, exit} from 'node:process';

function recvExactly(socket: Socket, numberBytes: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject): void => {
    const data: Buffer[] = [];
    let totalBytes: number = 0;

    const onData: (chunk: Buffer) => void = (chunk: Buffer): void => {
      data.push(chunk);
      totalBytes += chunk.length;

      if (totalBytes >= numberBytes) {
        socket.removeListener('data', onData);
        socket.removeListener('error', onError);
        socket.removeListener('close', onClose);
        resolve(Buffer.concat(data, numberBytes));
      }
    };

    const onError: (error: Error) => void = (error: Error): void => {
      socket.removeListener('data', onData);
      socket.removeListener('close', onClose);
      reject(error);
    };

    const onClose: () => void = (): void => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      reject(new Error(`Connection closed after ${totalBytes}/${numberBytes} bytes`));
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

async function jdwpHandshakeAndResume(host: string, port: number): Promise<boolean> {
  const socket: Socket = new Socket();

  try {
    socket.setTimeout(5000);

    // Connect and handshake
    await new Promise<void>((resolve, reject): void => {
      socket.connect(port, host, (): void => {
        resolve();
      });
      socket.on('error', (error: Error): void => {
        reject(error);
      });
    });

    socket.write('JDWP-Handshake');
    const response: Buffer = await recvExactly(socket, 14);

    if (!response.equals(Buffer.from('JDWP-Handshake'))) {
      console.error(`[JDWP] Handshake failed, got: ${response.toString('hex')}`);
      return false;
    }

    // Send VirtualMachine.Resume command (CommandSet=1, Command=9)
    const commandSet: number = 1;
    const command: number = 9;
    const length: Buffer = Buffer.alloc(4);
    length.writeUInt32BE(11, 0);
    const packetId: Buffer = Buffer.alloc(4);
    packetId.writeUInt32BE(1, 0);
    const flags: Buffer = Buffer.from([0x00]);
    const packet: Buffer = Buffer.concat([length, packetId, flags, Buffer.from([commandSet, command])]);

    socket.write(packet);
    await recvExactly(socket, 11);

    socket.end();
    console.log('[JDWP] Handshake + Resume successful');
    return true;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[JDWP] Connection failed: ${error.message}`);
    } else {
      console.error('[JDWP] Connection failed: Unknown error');
    }
    return false;
  } finally {
    socket.destroy();
  }
}

async function main(): Promise<number> {
  const arguments_: string[] = argv.slice(2);
  let host: string = 'localhost';
  let port: number = 5005;
  let timeout: number = 300;
  let stopFile: string = '/tmp/solo-jdwp-stop';

  // Simple argument parsing
  for (let index: number = 0; index < arguments_.length; index += 1) {
    const argument: string = arguments_[index];

    if (argument === '--timeout') {
      timeout = Number.parseInt(arguments_[index + 1], 10);
      index += 1;
    } else if (argument === '--stop-file') {
      stopFile = arguments_[index + 1];
      index += 1;
    } else if (!argument.startsWith('--') && index < 2) {
      if (index === 0) {
        host = argument;
      } else if (index === 1) {
        port = Number.parseInt(argument, 10);
      }
    }
  }

  if (!host || !port) {
    console.error('Usage: jdwp-tester <host> <port> [--timeout SECONDS] [--stop-file PATH]');
    return 1;
  }

  const deadline: number = Date.now() + timeout * 1000;
  let successCount: number = 0;

  console.log(`[JDWP] Starting probe for ${host}:${port} (timeout: ${timeout}s)`);

  while (true) {
    // Check for stop signal
    if (existsSync(stopFile)) {
      if (successCount > 0) {
        console.log(`[JDWP] Stop requested after ${successCount} successful resume(s)`);
        return 0;
      } else {
        console.error('[JDWP] Stop requested but no successful resume observed');
        return 1;
      }
    }

    // Try JDWP handshake and resume
    const success: boolean = await jdwpHandshakeAndResume(host, port);
    if (success) {
      successCount += 1;
      console.log(`[JDWP] Success count: ${successCount}`);
    }

    // Check timeout
    if (Date.now() >= deadline) {
      if (successCount > 0) {
        console.log(`[JDWP] Timeout reached with ${successCount} successful resume(s)`);
        return 0;
      } else {
        console.error(`[JDWP] Timed out after ${timeout}s without any successful handshake/resume`);
        return 1;
      }
    }

    await delay(2000);
  }
}

exit(await main());
