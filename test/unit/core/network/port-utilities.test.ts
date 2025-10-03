// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import net from 'node:net';
import {PortUtilities} from '../../../../src/business/utils/port-utilities.js';

// Mock logger for testing
const mockLogger = {
  debug: (): void => {},
  error: (): void => {},
  info: (): void => {},
  warn: (): void => {},
  showUser: (): void => {},
  showUserError: (): void => {},
  setDevMode: (): void => {},
  nextTraceId: (): void => {},
  prepMeta: (meta?: object): object => meta || {},
  showList: (): void => {},
  showJSON: (): void => {},
  addMessageGroup: (): void => {},
  addMessageGroupMessage: (): void => {},
  showMessageGroup: (): void => {},
  getMessageGroupKeys: (): string[] => [],
  showAllMessageGroups: (): void => {},
  getMessageGroup: (): string[] => [],
};

describe('Port Utils', (): void => {
  describe('findAvailablePort', (): void => {
    it('should find the next available port when the initial port is in use', async (): Promise<void> => {
      // Create a server to occupy a port
      const server = net.createServer();
      const basePort = 8000; // Use a port that's likely to be available for testing

      // Start the server on the base port
      await new Promise<void>(resolve => {
        server.listen(basePort, '127.0.0.1', () => {
          resolve();
        });
      });

      try {
        // Verify the port is actually in use
        const isBasePortAvailable = await PortUtilities.isPortAvailable(basePort);
        expect(isBasePortAvailable).to.be.false;

        // Call findAvailablePort with the occupied port
        const availablePort = await PortUtilities.findAvailablePort(basePort, 5000, mockLogger);

        // Verify that the returned port is the next port (basePort + 1)
        expect(availablePort).to.equal(basePort + 1);

        // Verify that the returned port is actually available
        const isNextPortAvailable = await PortUtilities.isPortAvailable(basePort + 1);
        expect(isNextPortAvailable).to.be.true;
      } finally {
        // Clean up: close the server
        await new Promise<void>(resolve => {
          server.close(() => {
            resolve();
          });
        });
      }
    });

    it('should return the initial port if it is available', async (): Promise<void> => {
      const basePort = 9000; // Use a different port for this test

      // Verify the port is available first
      const isBasePortAvailable = await PortUtilities.isPortAvailable(basePort);
      expect(isBasePortAvailable).to.be.true;

      // Call findAvailablePort with an available port
      const availablePort = await PortUtilities.findAvailablePort(basePort, 5000, mockLogger);

      // Verify that the returned port is the same as the input port
      expect(availablePort).to.equal(basePort);
    });
  });
});
