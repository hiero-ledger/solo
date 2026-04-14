#!/usr/bin/env node

/**
 * JDWP Tester - Standalone script for testing JDWP debug connections
 *
 * This script continuously attempts JDWP handshakes and resume commands
 * until successful or timeout. It's used to verify that debug port forwarding
 * is working and can resume suspended JVMs.
 */

import net, { type Socket } from 'node:net';
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

function recvExactly(socket: Socket, numBytes: number): Promise<Buffer> {
	return new Promise((resolve, reject): void => {
		const data: Buffer[] = [];
		let totalBytes = 0;

		const onData = (chunk: Buffer): void => {
			data.push(chunk);
			totalBytes += chunk.length;

			if (totalBytes >= numBytes) {
				socket.removeListener('data', onData);
				socket.removeListener('error', onError);
				socket.removeListener('close', onClose);
				resolve(Buffer.concat(data, numBytes));
			}
		};

		const onError = (error: Error): void => {
			socket.removeListener('data', onData);
			socket.removeListener('close', onClose);
			reject(error);
		};

		const onClose = (): void => {
			socket.removeListener('data', onData);
			socket.removeListener('error', onError);
			reject(
				new Error(
					`Connection closed after ${totalBytes}/${numBytes} bytes`
				)
			);
		};

		socket.on('data', onData);
		socket.on('error', onError);
		socket.on('close', onClose);
	});
}

async function jdwpHandshakeAndResume(
	host: string,
	port: number
): Promise<boolean> {
	const socket = new net.Socket();

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
		const response = await recvExactly(socket, 14);

		if (!response.equals(Buffer.from('JDWP-Handshake'))) {
			console.error(
				`[JDWP] Handshake failed, got: ${response.toString('hex')}`
			);
			return false;
		}

		// Send VirtualMachine.Resume command (CommandSet=1, Command=9)
		const cmdSet = 1;
		const cmd = 9;
		const length = Buffer.alloc(4);
		length.writeUInt32BE(11, 0);
		const packetId = Buffer.alloc(4);
		packetId.writeUInt32BE(1, 0);
		const flags = Buffer.from([0x00]);
		const packet = Buffer.concat([length, packetId, flags, Buffer.from([cmdSet, cmd])]);

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
	const args = process.argv.slice(2);
	let host = 'localhost';
	let port = 5005;
	let timeout = 300;
	let stopFile = '/tmp/solo-jdwp-stop';

	// Simple argument parsing
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];

		if (arg === '--timeout') {
			timeout = Number.parseInt(args[i + 1], 10);
			i += 1;
		} else if (arg === '--stop-file') {
			stopFile = args[i + 1];
			i += 1;
		} else if (!arg.startsWith('--') && i < 2) {
			if (i === 0) {
				host = arg;
			} else if (i === 1) {
				port = Number.parseInt(arg, 10);
			}
		}
	}

	if (!host || !port) {
		console.error('Usage: jdwp-tester <host> <port> [--timeout SECONDS] [--stop-file PATH]');
		return 1;
	}

	const deadline = Date.now() + timeout * 1000;
	let successCount = 0;

	console.log(
		`[JDWP] Starting probe for ${host}:${port} (timeout: ${timeout}s)`
	);

	while (true) {
		// Check for stop signal
		if (fs.existsSync(stopFile)) {
			if (successCount > 0) {
				console.log(
					`[JDWP] Stop requested after ${successCount} successful resume(s)`
				);
				return 0;
			} else {
				console.error('[JDWP] Stop requested but no successful resume observed');
				return 1;
			}
		}

		// Try JDWP handshake and resume
		const success = await jdwpHandshakeAndResume(host, port);
		if (success) {
			successCount += 1;
			console.log(`[JDWP] Success count: ${successCount}`);
		}

		// Check timeout
		if (Date.now() >= deadline) {
			if (successCount > 0) {
				console.log(
					`[JDWP] Timeout reached with ${successCount} successful resume(s)`
				);
				return 0;
			} else {
				console.error(
					`[JDWP] Timed out after ${timeout}s without any successful handshake/resume`
				);
				return 1;
			}
		}

		await delay(2000);
	}
}

process.exit(await main());
