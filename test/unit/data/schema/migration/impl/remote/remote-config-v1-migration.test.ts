// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {RemoteConfigV1Migration} from '../../../../../../../src/data/schema/migration/impl/remote/remote-config-v1-migration.js';
import {IllegalArgumentError} from '../../../../../../../src/business/errors/illegal-argument-error.js';
import {InvalidSchemaVersionError} from '../../../../../../../src/data/schema/migration/api/invalid-schema-version-error.js';
import * as sinon from 'sinon';
import {RemoteConfigMetadata} from '../../../../../../../src/core/config/remote/metadata.js';
import {SoloError} from '../../../../../../../src/core/errors/solo-error.js';

// Define a type for test objects
type TestObject = Record<string, any>;

describe('RemoteConfigV1Migration', () => {
  let migration: RemoteConfigV1Migration;
  let sandbox: sinon.SinonSandbox;
  let clock: sinon.SinonFakeTimers;
  const fixedDate = new Date('2023-01-01T00:00:00Z');
  const mockSoloVersion = '1.2.3';

  beforeEach((): void => {
    migration = new RemoteConfigV1Migration();
    sandbox = sinon.createSandbox();
    clock = sinon.useFakeTimers(fixedDate);
  });

  afterEach((): void => {
    sandbox.restore();
    clock.restore();
  });

  describe('range', (): void => {
    it('should return version range for schema version 0', () => {
      const range = migration.range;
      expect(range.toString()).to.equal('[0, 1)');
    });
  });

  describe('version', (): void => {
    it('should return version 1', (): void => {
      const version = migration.version;
      expect(version.value).to.equal(1);
    });
  });

  describe('migrate', (): void => {
    it('should throw IllegalArgumentError when source is null', async (): Promise<void> => {
      expect(await migration.migrate(null as unknown as object)).to.throw(
        IllegalArgumentError,
        'source must not be null or undefined',
      );
    });

    it('should throw IllegalArgumentError when source is undefined', async (): Promise<void> => {
      await expect(migration.migrate(undefined as unknown as object)).to.be.rejectedWith(
        IllegalArgumentError,
        'source must not be null or undefined',
      );
    });

    it('should throw InvalidSchemaVersionError when schemaVersion is not 0', async (): Promise<void> => {
      const source: object = {
        schemaVersion: 2,
      };

      await expect(migration.migrate(source)).to.be.rejectedWith(
        InvalidSchemaVersionError,
        'Invalid schema version: 2, expected: 0',
      );
    });

    it('should set metadata with lastUpdated information', async (): Promise<void> => {
      const source: object = {};
      const result: object = await migration.migrate(source);

      expect(result).to.have.property('metadata');
      expect(result.metadata).to.have.property('lastUpdatedAt').that.deep.equals(fixedDate);
      expect(result.metadata).to.have.property('lastUpdatedBy').that.deep.equals({
        name: 'system',
        hostname: 'migration',
      });
    });

    it('should migrate version information correctly', async (): Promise<void> => {
      const source: object = {
        metadata: {
          soloVersion: '1.0.0',
          soloChartVersion: '2.0.0',
          hederaPlatformVersion: '3.0.0',
          hederaMirrorNodeChartVersion: '4.0.0',
          hederaExplorerChartVersion: '5.0.0',
          hederaJsonRpcRelayChartVersion: '6.0.0',
        },
      };

      const result: object = await migration.migrate(source);

      expect(result).to.have.property('versions');
      expect(result.versions).to.deep.equal({
        cli: '1.0.0',
        chart: '2.0.0',
        consensusNode: '3.0.0',
        mirrorNodeChart: '4.0.0',
        explorerChart: '5.0.0',
        jsonRpcRelayChart: '6.0.0',
        blockNodeChart: '',
      });

      // Verify old version properties are deleted
      expect(result.metadata).to.not.have.property('soloVersion');
      expect(result.metadata).to.not.have.property('soloChartVersion');
      expect(result.metadata).to.not.have.property('hederaPlatformVersion');
      expect(result.metadata).to.not.have.property('hederaMirrorNodeChartVersion');
      expect(result.metadata).to.not.have.property('hederaExplorerChartVersion');
      expect(result.metadata).to.not.have.property('hederaJsonRpcRelayChartVersion');
    });

    it('should use default version values when metadata versions are not present', async (): Promise<void> => {
      const source: object = {
        metadata: {},
      };

      const result: object = await migration.migrate(source);

      expect(result).to.have.property('versions');
      expect(result.versions).to.deep.equal({
        cli: mockSoloVersion,
        chart: '0.0.0',
        consensusNode: '0.0.0',
        mirrorNodeChart: '0.0.0',
        explorerChart: '0.0.0',
        jsonRpcRelayChart: '0.0.0',
        blockNodeChart: '',
      });
    });

    it('should migrate clusters correctly', async (): Promise<void> => {
      const source: object = {
        clusters: {
          cluster1: {
            name: 'cluster1',
            namespace: 'namespace1',
            deployment: 'deployment1',
            dnsBaseDomain: 'domain1',
            dnsConsensusNodePattern: 'pattern1',
          },
          cluster2: {
            name: 'cluster2',
            namespace: 'namespace2',
            deployment: 'deployment2',
            dnsBaseDomain: 'domain2',
            dnsConsensusNodePattern: 'pattern2',
          },
        },
      };

      const result: object = await migration.migrate(source);

      expect(result).to.have.property('clusters');
      expect(Array.isArray(result.clusters)).to.be.true;
      expect(result.clusters.length).to.equal(2);

      // Since Object.keys() order is not guaranteed, we need to check both possible orders
      const clusterNames = result.clusters.map((c: any) => c.name);
      expect(clusterNames).to.include('cluster1');
      expect(clusterNames).to.include('cluster2');

      const cluster1 = result.clusters.find((c: any) => c.name === 'cluster1');
      expect(cluster1).to.deep.include({
        name: 'cluster1',
        namespace: 'namespace1',
        deployment: 'deployment1',
        dnsBaseDomain: 'domain1',
        dnsConsensusNodePattern: 'pattern1',
      });

      const cluster2 = result.clusters.find((c: any) => c.name === 'cluster2');
      expect(cluster2).to.deep.include({
        name: 'cluster2',
        namespace: 'namespace2',
        deployment: 'deployment2',
        dnsBaseDomain: 'domain2',
        dnsConsensusNodePattern: 'pattern2',
      });
    });

    it('should delete namespace and deploymentName from metadata', async (): Promise<void> => {
      const source: object = {
        metadata: {
          namespace: 'oldNamespace',
          deploymentName: 'oldDeployment',
        },
      };

      const result: object = await migration.migrate(source);

      expect(result.metadata).to.not.have.property('namespace');
      expect(result.metadata).to.not.have.property('deploymentName');
    });

    it('should migrate component state correctly', async (): Promise<void> => {
      const source: object = {
        components: {
          consensusNodes: {
            node1: {
              name: 'node1',
              nodeId: 1,
              namespace: 'namespace1',
              cluster: 'cluster1',
            },
          },
          haproxies: {
            haproxy1: {
              name: 'haproxy1',
              namespace: 'namespace1',
              cluster: 'cluster1',
            },
          },
          envoyProxies: {
            envoy1: {
              name: 'envoy1',
              namespace: 'namespace1',
              cluster: 'cluster1',
            },
          },
          explorers: {
            explorer1: {
              name: 'explorer1',
              namespace: 'namespace1',
              cluster: 'cluster1',
            },
          },
          mirrorNodes: {
            mirror1: {
              name: 'mirror1',
              namespace: 'namespace1',
              cluster: 'cluster1',
            },
          },
          relayNodes: {
            relay1: {
              name: 'relay1',
              namespace: 'namespace1',
              cluster: 'cluster1',
            },
          },
        },
      };

      const result: object = await migration.migrate(source);

      expect(result).to.have.property('state');
      expect(result.state).to.have.property('ledgerPhase', 'initialized');

      // Check consensus nodes
      expect(result.state.consensusNodes).to.have.lengthOf(1);
      expect(result.state.consensusNodes[0]).to.deep.include({
        id: 1,
        name: 'node1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Check haProxies
      expect(result.state.haProxies).to.have.lengthOf(1);
      expect(result.state.haProxies[0]).to.deep.include({
        name: 'haproxy1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Check envoyProxies
      expect(result.state.envoyProxies).to.have.lengthOf(1);
      expect(result.state.envoyProxies[0]).to.deep.include({
        name: 'envoy1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Check explorers
      expect(result.state.explorers).to.have.lengthOf(1);
      expect(result.state.explorers[0]).to.deep.include({
        name: 'explorer1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Check mirrorNodes
      expect(result.state.mirrorNodes).to.have.lengthOf(1);
      expect(result.state.mirrorNodes[0]).to.deep.include({
        name: 'mirror1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Check relayNodes
      expect(result.state.relayNodes).to.have.lengthOf(1);
      expect(result.state.relayNodes[0]).to.deep.include({
        name: 'relay1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Verify old components structure is deleted
      expect(result).to.not.have.property('components');
    });

    it('should migrate command history correctly', async () => {
      const source = {
        commandHistory: {
          command1: 'details1',
          command2: 'details2',
        },
        lastExecutedCommand: 'lastCommand',
      };

      const result = await migration.migrate(source);

      expect(result).to.have.property('history');
      expect(result.history).to.have.property('commands');
      expect(result.history.commands).to.include('command1');
      expect(result.history.commands).to.include('command2');
      expect(result.history).to.have.property('lastExecutedCommand', 'lastCommand');

      // Verify old history properties are deleted
      expect(result).to.not.have.property('commandHistory');
      expect(result).to.not.have.property('lastExecutedCommand');
    });

    it('should set the schema version to 1', async () => {
      const source = {};
      const result = await migration.migrate(source);

      expect(result).to.have.property('schemaVersion', 1);
    });

    it('should perform a complete migration with all properties', async () => {
      const source = {
        metadata: {
          soloVersion: '1.0.0',
          soloChartVersion: '2.0.0',
          hederaPlatformVersion: '3.0.0',
          hederaMirrorNodeChartVersion: '4.0.0',
          hederaExplorerChartVersion: '5.0.0',
          hederaJsonRpcRelayChartVersion: '6.0.0',
          namespace: 'oldNamespace',
          deploymentName: 'oldDeployment',
        },
        clusters: {
          cluster1: {
            name: 'cluster1',
            namespace: 'namespace1',
            deployment: 'deployment1',
            dnsBaseDomain: 'domain1',
            dnsConsensusNodePattern: 'pattern1',
          },
        },
        components: {
          consensusNodes: {
            node1: {
              name: 'node1',
              nodeId: 1,
              namespace: 'namespace1',
              cluster: 'cluster1',
            },
          },
          haproxies: {},
          envoyProxies: {},
          explorers: {},
          mirrorNodes: {},
          relayNodes: {},
        },
        commandHistory: {
          command1: 'details1',
        },
        lastExecutedCommand: 'lastCommand',
      };

      const result = await migration.migrate(source);

      // Check all migrated properties
      expect(result).to.have.property('metadata');
      expect(result).to.have.property('versions');
      expect(result).to.have.property('clusters');
      expect(result).to.have.property('state');
      expect(result).to.have.property('history');
      expect(result).to.have.property('schemaVersion', 1);

      // Verify old properties are deleted
      expect(result).to.not.have.property('components');
      expect(result).to.not.have.property('commandHistory');
      expect(result).to.not.have.property('lastExecutedCommand');
    });
  });
});
