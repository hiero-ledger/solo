// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {VersionHelper} from '../../../../src/core/helpers/version-helper.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {SoloPinoLogger} from '../../../../src/core/logging/solo-pino-logger.js';
import * as sinon from 'sinon';
import * as childProcess from 'node:child_process';

describe('VersionHelper', () => {
  let logger: SoloPinoLogger;
  let execSyncStub: sinon.SinonStub;

  beforeEach(() => {
    logger = new SoloPinoLogger('info', false);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('fetchLatestVersion', () => {
    it('should fetch version from OCI registry', async () => {
      const chartUrl: string = 'oci://ghcr.io/test/registry';
      const chartName: string = 'test-chart';
      const expectedVersion: string = '1.2.3';

      // Mock execSync to return a valid chart YAML
      const mockYaml: string = `
apiVersion: v2
name: test-chart
version: ${expectedVersion}
description: Test chart
`;

      execSyncStub = sinon.stub(childProcess, 'execSync').returns(mockYaml);

      const result: string = await VersionHelper.fetchLatestVersion(logger, chartUrl, chartName);

      expect(result).to.equal(expectedVersion);
      expect(execSyncStub.calledOnce).to.be.true;
    });

    it('should fetch version from standard Helm repository', async () => {
      const chartUrl: string = 'https://charts.example.com';
      const chartName: string = 'test-chart';
      const expectedVersion: string = '2.3.4';

      // Mock execSync to handle repo add, update, search, and remove
      const mockSearchOutput: string = JSON.stringify([
        {
          name: 'test-repo/test-chart',
          version: expectedVersion,
          app_version: '1.0.0',
        },
        {
          name: 'test-repo/test-chart',
          version: '2.3.3',
          app_version: '0.9.0',
        },
      ]);

      let callCount: number = 0;
      execSyncStub = sinon.stub(childProcess, 'execSync').callsFake((command: string) => {
        callCount++;
        if (command.includes('helm repo add')) {
          return Buffer.from('repo added');
        } else if (command.includes('helm repo update')) {
          return Buffer.from('repo updated');
        } else if (command.includes('helm search repo')) {
          return Buffer.from(mockSearchOutput);
        } else if (command.includes('helm repo remove')) {
          return Buffer.from('repo removed');
        }
        return Buffer.from('');
      });

      const result: string = await VersionHelper.fetchLatestVersion(logger, chartUrl, chartName);

      expect(result).to.equal(expectedVersion);
      expect(callCount).to.equal(4); // add, update, search, remove
    });

    it('should throw error when OCI registry chart not found', async () => {
      const chartUrl: string = 'oci://ghcr.io/test/registry';
      const chartName: string = 'missing-chart';

      execSyncStub = sinon.stub(childProcess, 'execSync').throws(new Error('chart not found'));

      try {
        await VersionHelper.fetchLatestVersion(logger, chartUrl, chartName);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
        expect(error.message).to.include('Failed to fetch latest version');
      }
    });

    it('should throw error when no versions found in Helm repository', async () => {
      const chartUrl: string = 'https://charts.example.com';
      const chartName: string = 'missing-chart';

      execSyncStub = sinon.stub(childProcess, 'execSync').callsFake((command: string) => {
        if (command.includes('helm repo add')) {
          return Buffer.from('repo added');
        } else if (command.includes('helm repo update')) {
          return Buffer.from('repo updated');
        } else if (command.includes('helm search repo')) {
          return Buffer.from('[]'); // Empty results
        } else if (command.includes('helm repo remove')) {
          return Buffer.from('repo removed');
        }
        return Buffer.from('');
      });

      try {
        await VersionHelper.fetchLatestVersion(logger, chartUrl, chartName);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
        expect(error.message).to.include('No versions found');
      }
    });

    it('should throw error when OCI chart YAML is invalid', async () => {
      const chartUrl: string = 'oci://ghcr.io/test/registry';
      const chartName: string = 'test-chart';

      // Mock execSync to return invalid YAML (no version field)
      const mockYaml: string = `
apiVersion: v2
name: test-chart
description: Test chart without version
`;

      execSyncStub = sinon.stub(childProcess, 'execSync').returns(mockYaml);

      try {
        await VersionHelper.fetchLatestVersion(logger, chartUrl, chartName);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
        expect(error.message).to.include('Could not parse version');
      }
    });

    it('should clean up temporary repo even when search fails', async () => {
      const chartUrl: string = 'https://charts.example.com';
      const chartName: string = 'test-chart';
      let removeRepoCalled: boolean = false;

      execSyncStub = sinon.stub(childProcess, 'execSync').callsFake((command: string) => {
        if (command.includes('helm repo add')) {
          return Buffer.from('repo added');
        } else if (command.includes('helm repo update')) {
          return Buffer.from('repo updated');
        } else if (command.includes('helm search repo')) {
          throw new Error('Search failed');
        } else if (command.includes('helm repo remove')) {
          removeRepoCalled = true;
          return Buffer.from('repo removed');
        }
        return Buffer.from('');
      });

      try {
        await VersionHelper.fetchLatestVersion(logger, chartUrl, chartName);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
        // Verify cleanup was called
        expect(removeRepoCalled).to.be.true;
      }
    });
  });

  describe('fetchLatestConsensusNodeVersion', () => {
    it('should throw error indicating not yet implemented', async () => {
      try {
        await VersionHelper.fetchLatestConsensusNodeVersion(logger);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
        expect(error.message).to.include('not yet implemented');
      }
    });
  });
});
