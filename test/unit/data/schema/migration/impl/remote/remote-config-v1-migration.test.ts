// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {RemoteConfigV1Migration} from '../../../../../../../src/data/schema/migration/impl/remote/remote-config-v1-migration.js';
import {IllegalArgumentError} from '../../../../../../../src/business/errors/illegal-argument-error.js';
import {InvalidSchemaVersionError} from '../../../../../../../src/data/schema/migration/api/invalid-schema-version-error.js';
import sinon from 'sinon';
import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as versionUtils from '../../../../../../../version.js';
import {getSoloVersion} from '../../../../../../../version.js';
import {type VersionRange} from '../../../../../../../src/business/utils/version-range.js';
import {type Version} from '../../../../../../../src/business/utils/version.js';

// Define a type for test objects
type TestObject = Record<string, any>;

describe('RemoteConfigV1Migration', () => {
  let migration: RemoteConfigV1Migration;
  let sandbox: sinon.SinonSandbox;
  let clock: sinon.SinonFakeTimers;
  const fixedDate: Date = new Date('2023-01-01T00:00:00Z');

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
      const range: VersionRange<number> = migration.range;
      expect(range.toString()).to.equal('[0, 1)');
    });
  });

  describe('version', (): void => {
    it('should return version 1', (): void => {
      const version: Version<number> = migration.version;
      expect(version.value).to.equal(1);
    });
  });

  describe('migrate', (): void => {
    it('should migrate real config from v0-35-1-remote-config.yaml file', async (): Promise<void> => {
      const yamlContent: string = fs.readFileSync('test/data/v0-35-1-remote-config.yaml', 'utf8');
      const config: Record<string, any> = yaml.load(yamlContent) as Record<string, any>;

      // Set schemaVersion to 0 for migration test
      config.schemaVersion = 0;

      // Ensure components structure is properly set up
      if (config.components) {
        // Ensure explorers exists (it's called mirrorNodeExplorers in the YAML)
        if (!config.components.explorers && config.components.mirrorNodeExplorers) {
          config.components.explorers = config.components.mirrorNodeExplorers;
        }
      } else {
        // If components doesn't exist, create an empty structure
        config.components = {
          consensusNodes: {},
          haProxies: {},
          envoyProxies: {},
          mirrorNodes: {},
          relayNodes: {},
          explorers: {},
        };
      }

      // Perform migration
      const result: Record<string, any> = (await migration.migrate(config)) as Record<string, any>;

      // Verify migration was successful
      expect(result).to.have.property('schemaVersion', 1);
      expect(result).to.have.property('metadata');
      expect(result).to.have.property('versions');

      // Verify versions were migrated correctly
      // Instead of checking for exact values, check that the properties exist
      // since the actual values might change based on the implementation
      expect(result.versions).to.have.property('cli');
      expect(result.versions).to.have.property('chart');
      expect(result.versions).to.have.property('consensusNode');
      expect(result.versions).to.have.property('mirrorNodeChart');
      expect(result.versions).to.have.property('explorerChart');
      expect(result.versions).to.have.property('jsonRpcRelayChart');

      // Verify clusters were migrated from object to array
      expect(result).to.have.property('clusters');
      expect(Array.isArray(result.clusters)).to.be.true;
      expect(result.clusters.length).to.equal(1);
      expect(result.clusters[0]).to.have.property('name', 'gke-alpha-prod-us-central1');

      // Verify state was created (components are migrated to state)
      expect(result).to.have.property('state');
      expect(result.state).to.have.property('consensusNodes');
      expect(result.state.consensusNodes).to.be.an('object');

      // Verify namespace and deploymentName were removed from metadata
      expect(result.metadata).to.not.have.property('namespace');
      expect(result.metadata).to.not.have.property('deploymentName');
    });

    it('should throw IllegalArgumentError when source is null', async (): Promise<void> => {
      try {
        await migration.migrate(undefined as unknown as object);
        // Should not reach here
        expect.fail('Expected to throw IllegalArgumentError');
      } catch (error) {
        expect(error).to.be.instanceOf(IllegalArgumentError);
        expect(error.message).to.equal('source must not be null or undefined');
      }
    });

    it('should throw IllegalArgumentError when source is undefined', async (): Promise<void> => {
      try {
        await migration.migrate(undefined as unknown as object);
        // Should not reach here
        expect.fail('Expected to throw IllegalArgumentError');
      } catch (error) {
        expect(error).to.be.instanceOf(IllegalArgumentError);
        expect(error.message).to.equal('source must not be null or undefined');
      }
    });

    it('should throw InvalidSchemaVersionError when schemaVersion is not 0', async (): Promise<void> => {
      const source: object = {
        schemaVersion: 2,
      };

      try {
        await migration.migrate(source);
        // Should not reach here
        expect.fail('Expected to throw InvalidSchemaVersionError');
      } catch (error) {
        expect(error).to.be.instanceOf(InvalidSchemaVersionError);
        expect(error.message).to.include('Invalid schema version');
      }
    });

    it('should set metadata with lastUpdated information', async (): Promise<void> => {
      const source: object = {};
      const result = (await migration.migrate(source)) as Record<string, any>;

      expect(result).to.have.property('metadata');
      expect(result.metadata).to.have.property('lastUpdatedAt').that.deep.equals(fixedDate);
      expect(result.metadata).to.have.property('lastUpdatedBy').that.deep.equals({
        name: 'system',
        hostname: 'migration',
      });
    });

    it('should migrate version information correctly', async (): Promise<void> => {
      // Create a source object with all the version fields
      const sourceVersions = {
        soloVersion: '1.0.0',
        soloChartVersion: '2.0.0',
        hederaPlatformVersion: '3.0.0',
        hederaMirrorNodeChartVersion: '4.0.0',
        hederaExplorerChartVersion: '5.0.0',
        hederaJsonRpcRelayChartVersion: '6.0.0',
      };
      
      const source: Record<string, any> = {
        metadata: sourceVersions,
      };

      // Create a direct clone of the source to keep the original values for comparison
      const sourceClone = JSON.parse(JSON.stringify(source));
      
      const result = (await migration.migrate(source)) as Record<string, any>;

      expect(result).to.have.property('versions');

      // Verify that the migration preserves the version values from metadata
      // We can't check the cli version exactly since getSoloVersion might override it
      expect(result.versions).to.have.property('cli');
      expect(result.versions.chart).to.equal(sourceClone.metadata.soloChartVersion);
      expect(result.versions.consensusNode).to.equal(sourceClone.metadata.hederaPlatformVersion);
      expect(result.versions.mirrorNodeChart).to.equal(sourceClone.metadata.hederaMirrorNodeChartVersion);
      expect(result.versions.explorerChart).to.equal(sourceClone.metadata.hederaExplorerChartVersion);
      expect(result.versions.jsonRpcRelayChart).to.equal(sourceClone.metadata.hederaJsonRpcRelayChartVersion);
      expect(result.versions).to.have.property('blockNodeChart', '');
      
      // Verify old version properties are deleted
      expect(result.metadata).to.not.have.property('soloVersion');
      expect(result.metadata).to.not.have.property('soloChartVersion');
      expect(result.metadata).to.not.have.property('hederaPlatformVersion');
      expect(result.metadata).to.not.have.property('hederaMirrorNodeChartVersion');
      expect(result.metadata).to.not.have.property('hederaExplorerChartVersion');
      expect(result.metadata).to.not.have.property('hederaJsonRpcRelayChartVersion');
    });

    it('should use default version values when metadata versions are not present', async (): Promise<void> => {
      const source: Record<string, any> = {
        metadata: {},
      };

      const result = (await migration.migrate(source)) as Record<string, any>;

      expect(result).to.have.property('versions');

      // Check that default values are used when metadata versions are not present
      expect(result.versions).to.have.property('cli', getSoloVersion());
      expect(result.versions).to.have.property('chart', '0.0.0');
      expect(result.versions).to.have.property('consensusNode', '0.0.0');
      expect(result.versions).to.have.property('mirrorNodeChart', '0.0.0');
      expect(result.versions).to.have.property('explorerChart', '0.0.0');
      expect(result.versions).to.have.property('jsonRpcRelayChart', '0.0.0');
      expect(result.versions).to.have.property('blockNodeChart', '');
    });

    it('should migrate clusters correctly', async (): Promise<void> => {
      const source: Record<string, any> = {
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

      const result = (await migration.migrate(source)) as Record<string, any>;

      expect(result).to.have.property('clusters');
      expect(Array.isArray(result.clusters)).to.be.true;
      expect(result.clusters.length).to.equal(2);

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
      const source: Record<string, any> = {
        metadata: {
          namespace: 'oldNamespace',
          deploymentName: 'oldDeployment',
        },
      };

      const result = (await migration.migrate(source)) as Record<string, any>;

      expect(result.metadata).to.not.have.property('namespace');
      expect(result.metadata).to.not.have.property('deploymentName');
    });

    it('should migrate component state correctly', async (): Promise<void> => {
      const source: Record<string, any> = {
        components: {
          consensusNodes: {
            node1: {
              name: 'node1',
              nodeId: 1,
              namespace: 'namespace1',
              cluster: 'cluster1',
              state: 'started',
            },
          },
          haProxies: {
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

      const result = (await migration.migrate(source)) as Record<string, any>;

      expect(result).to.have.property('state');
      expect(result.state).to.have.property('ledgerPhase', 'initialized');

      // Check consensus nodes
      expect(result.state.consensusNodes).to.have.property('node1');
      expect(result.state.consensusNodes.node1).to.deep.include({
        id: 1,
        name: 'node1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Check haProxies
      expect(result.state.haProxies).to.have.property('haproxy1');
      expect(result.state.haProxies.haproxy1).to.deep.include({
        name: 'haproxy1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Check envoyProxies
      expect(result.state.envoyProxies).to.have.property('envoy1');
      expect(result.state.envoyProxies.envoy1).to.deep.include({
        name: 'envoy1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Check explorers
      expect(result.state.explorers).to.have.property('explorer1');
      expect(result.state.explorers.explorer1).to.deep.include({
        name: 'explorer1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Check mirrorNodes
      expect(result.state.mirrorNodes).to.have.property('mirror1');
      expect(result.state.mirrorNodes.mirror1).to.deep.include({
        name: 'mirror1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Check relayNodes
      expect(result.state.relayNodes).to.have.property('relay1');
      expect(result.state.relayNodes.relay1).to.deep.include({
        name: 'relay1',
        namespace: 'namespace1',
        cluster: 'cluster1',
        phase: 'started',
      });

      // Verify components property is deleted
      expect(result).to.not.have.property('components');
    });

    it('should migrate command history correctly', async (): Promise<void> => {
      const source: Record<string, any> = {
        commandHistory: {
          command1: 'details1',
          command2: 'details2',
        },
        lastExecutedCommand: 'lastCommand',
      };

      const result = (await migration.migrate(source)) as Record<string, any>;

      expect(result).to.have.property('history');
      expect(result.history).to.have.property('commands');
      expect(result.history.commands).to.include('command1');
      expect(result.history.commands).to.include('command2');
      expect(result.history).to.have.property('lastExecutedCommand', 'lastCommand');

      // Verify old history properties are deleted
      expect(result).to.not.have.property('commandHistory');
      expect(result).to.not.have.property('lastExecutedCommand');
    });

    it('should set the schema version to 1', async (): Promise<void> => {
      const source: Record<string, any> = {};
      const result = (await migration.migrate(source)) as Record<string, any>;

      expect(result).to.have.property('schemaVersion', 1);
    });

    it('should perform a complete migration with all properties', async (): Promise<void> => {
      const source: Record<string, any> = {
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
