// SPDX-License-Identifier: Apache-2.0

import net from 'node:net';
import * as constants from '../../core/constants.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

/**
 * Utility class for port-related operations
 */
export class PortUtilities {
  /**
   * Check if a TCP port is available on the local machine
   * @param port Port number to check
   * @returns Promise that resolves to true if port is available, false otherwise
   */
  public static async isPortAvailable(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const server: net.Server = net.createServer();
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error(`Timeout while checking port ${port}`));
      }, 5000); // 5-second timeout

      server.once('error', error => {
        clearTimeout(timeout);
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          // Port is in use
          resolve(false);
        } else {
          // Unexpected error
          reject(error);
        }
      });

      server.once('listening', () => {
        clearTimeout(timeout);
        // Port is available
        server.close(() => {
          resolve(true);
        });
      });
      server.listen(port, constants.LOCAL_HOST);
    });
  }

  /**
   * Find an available port starting from the given port
   * @param startPort Port number to start checking from
   * @param timeoutMs Timeout in milliseconds before giving up (default: 30000)
   * @param logger logger for debug messages
   * @returns Promise that resolves to the first available port or throws an error if timeout is reached
   * @throws Error if no available port is found within the timeout period
   */
  public static async findAvailablePort(
    startPort: number,
    timeoutMs: number = 30_000,
    logger: SoloLogger,
  ): Promise<number> {
    if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65_535) {
      throw new Error(`Invalid startPort: ${startPort}. Must be an integer between 1 and 65535.`);
    }
    let port: number = startPort;
    let attempts: number = 0;
    const startTime: number = Date.now();

    while (!(await this.isPortAvailable(port))) {
      logger.debug(`Port ${port} is not available, trying ${port + 1}`);
      port++;
      attempts++;

      if (Date.now() - startTime > timeoutMs) {
        const errorMessage: string = `Failed to find an available port after ${timeoutMs}ms timeout, starting from port ${startPort}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }
    }

    return port;
  }
}

// The managePortForward function has been moved to components-data-wrapper.ts
