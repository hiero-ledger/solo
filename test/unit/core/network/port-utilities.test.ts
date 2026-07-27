// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import net from 'node:net';
import {PortUtilities} from '../../../../src/business/utils/port-utilities.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {SoloPinoLogger} from '../../../../src/core/logging/solo-pino-logger.js';
import sinon from 'sinon';

// Mock logger for testing
const mockLogger: SoloLogger = sinon.createStubInstance(SoloPinoLogger) as unknown as SoloLogger;
describe('Port Utils', (): void => {
  describe('findAvailablePort', (): void => {
    it('should find the next available port when the initial port is in use', async (): Promise<void> => {
      // Create a server to occupy a port
      const server: net.Server = net.createServer();
      const basePort: number = 8000; // Use a port that's likely to be available for testing

      // Start the server on the base port
      await new Promise<void>((resolve): void => {
        server.listen(basePort, '127.0.0.1', (): void => {
          resolve();
        });
      });

      try {
        // Verify the port is actually in use
        const isBasePortAvailable: boolean = await PortUtilities.isPortAvailable(basePort);
        expect(isBasePortAvailable).to.be.false;

        // Call findAvailablePort with the occupied port
        const availablePort: number = await PortUtilities.findAvailablePort(basePort, 5000, mockLogger);

        // Verify that the returned port is the next port (basePort + 1)
        expect(availablePort).to.equal(basePort + 1);

        // Verify that the returned port is actually available
        const isNextPortAvailable: boolean = await PortUtilities.isPortAvailable(basePort + 1);
        expect(isNextPortAvailable).to.be.true;
      } finally {
        // Clean up: close the server
        await new Promise<void>((resolve): void => {
          server.close((): void => {
            resolve();
          });
        });
      }
    });

    it('should return the initial port if it is available', async (): Promise<void> => {
      const basePort: number = 9000; // Use a different port for this test

      // Verify the port is available first
      const isBasePortAvailable: boolean = await PortUtilities.isPortAvailable(basePort);
      expect(isBasePortAvailable).to.be.true;

      // Call findAvailablePort with an available port
      const availablePort: number = await PortUtilities.findAvailablePort(basePort, 5000, mockLogger);

      // Verify that the returned port is the same as the input port
      expect(availablePort).to.equal(basePort);
    });
  });
});
