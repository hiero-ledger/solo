// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {expect} from 'chai';
import {beforeEach} from 'mocha';
import os from 'node:os';
import {instanceToPlain, plainToInstance} from 'class-transformer';
import {RemoteConfigSchema} from '../../../../../../src/data/schema/model/remote/remote-config-schema.js';
import {LedgerPhase} from '../../../../../../src/data/schema/model/remote/ledger-phase.js';
import {DeploymentPhase} from '../../../../../../src/data/schema/model/remote/deployment-phase.js';

type MigrationCandidate = any;

function migrateVersionPrefix(version: string): string {
  const strippedVersionPrefix: string = version.replace(/^v/, '');
  const parts: number[] = strippedVersionPrefix.split('.').map(Number); // Split and convert to numbers
  while (parts.length < 3) {
    parts.push(0); // Add missing minor/patch as 0
  }
  return parts.join('.');
}

function migrateVersions(plainObject: MigrationCandidate): void {
  plainObject.versions = {};
  plainObject.versions.cli = migrateVersionPrefix(plainObject.metadata?.soloVersion || '0.0.0');
  plainObject.versions.chart = migrateVersionPrefix(plainObject.metadata?.soloChartVersion || '0.0.0');
  plainObject.versions.consensusNode = migrateVersionPrefix(
    plainObject.metadata?.hederaPlatformVersion || plainObject.flags?.releaseTag || '0.0.0',
  );
  plainObject.versions.mirrorNodeChart = migrateVersionPrefix(
    plainObject.metadata?.hederaMirrorNodeChartVersion || plainObject.flags?.mirrorNodeVersion || '0.0.0',
  );
  plainObject.versions.explorerChart = migrateVersionPrefix(
    plainObject.metadata?.explorerChartVersion || plainObject.flags?.explorerVersion || '0.0.0',
  );
  plainObject.versions.jsonRpcRelayChart = migrateVersionPrefix(
    plainObject.metadata?.hederaJsonRpcRelayChartVersion || plainObject.flags?.relayReleaseTag || '0.0.0',
  );

  plainObject.versions.blockNodeChart = 'v0.0.0';
}

function migrateClusters(plainObject: MigrationCandidate): void {
  const clusters: object = plainObject.clusters;
  const clustersArray: object[] = [];
  for (const key in clusters) {
    expect(clusters[key]).to.not.be.undefined.and.to.not.be.null;
    const cluster = clusters[key];
    clustersArray.push(cluster);
  }
  plainObject.clusters = clustersArray;
}

function migrateHistory(plainObject: MigrationCandidate): void {
  plainObject.history = {};
  plainObject.history.commands = [];
  for (const historyItem of plainObject.commandHistory) {
    plainObject.history.commands.push(historyItem);
  }
}

function migrateConsensusNodes(plainObject: MigrationCandidate): void {
  plainObject.state.consensusNodes = [];
  for (const plainConsensusNodeKey of Object.keys(plainObject.components?.consensusNodes)) {
    const oldConsensusNode = plainObject.components.consensusNodes[plainConsensusNodeKey];
    let migratedState: string;
    switch (oldConsensusNode.state) {
      case 'requested': {
        migratedState = DeploymentPhase.REQUESTED;
        break;
      }
      case 'initialized': {
        migratedState = DeploymentPhase.DEPLOYED;
        break;
      }
      case 'setup': {
        migratedState = DeploymentPhase.CONFIGURED;
        break;
      }
      case 'started': {
        migratedState = DeploymentPhase.STARTED;
        break;
      }
      case 'freezed': {
        migratedState = DeploymentPhase.FROZEN;
        break;
      }
      case 'stopped': {
        migratedState = DeploymentPhase.STOPPED;
        break;
      }
    }
    const newConsensusNode = {
      id: oldConsensusNode.nodeId + 1,
      namespace: oldConsensusNode.namespace,
      cluster: oldConsensusNode.cluster,
      phase: migratedState,
    };
    plainObject.state.consensusNodes.push({metadata: newConsensusNode});
  }
}

function migrateHaProxies(plainObject: MigrationCandidate): void {
  plainObject.state.haProxies = [];
}

function migrateEnvoyProxies(plainObject: MigrationCandidate): void {
  plainObject.state.envoyProxies = [];
}

function migrateMirrorNodes(plainObject: MigrationCandidate): void {
  plainObject.state.mirrorNodes = [];
}

function migrateExplorers(plainObject: MigrationCandidate): void {
  plainObject.state.explorers = [];
}

function migrateJsonRpcRelays(plainObject: MigrationCandidate): void {
  plainObject.state.relayNodes = [];
}

function migrateState(plainObject: MigrationCandidate): void {
  plainObject.state = {};
  plainObject.state.ledgerPhase = LedgerPhase.UNINITIALIZED;
  migrateConsensusNodes(plainObject);
  migrateHaProxies(plainObject);
  migrateEnvoyProxies(plainObject);
  migrateMirrorNodes(plainObject);
  migrateExplorers(plainObject);
  migrateJsonRpcRelays(plainObject);
}

function migrate(plainObject: MigrationCandidate): void {
  plainObject.schemaVersion = 0;

  const meta = plainObject.metadata;
  meta.lastUpdatedBy = {
    name: os.userInfo().username,
    hostname: os.hostname(),
  };

  migrateClusters(plainObject);
  migrateVersions(plainObject);
  migrateHistory(plainObject);
  migrateState(plainObject);
}

describe('RemoteConfig', (): void => {
  const remoteConfigPath: string = 'test/data/v0-35-1-remote-config.yaml';

  describe('Class Transformer', (): void => {
    let yamlData: string;
    let plainObject: MigrationCandidate;

    beforeEach((): void => {
      yamlData = readFileSync(remoteConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = parse(yamlData) as MigrationCandidate;
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;

      migrate(plainObject);
    });

    function expectRemoteConfigClass(rc: RemoteConfigSchema) {
      expect(rc).to.not.be.undefined.and.to.not.be.null;
      expect(rc.history.commands.length).to.be.equal(9);
      expect(rc.versions.cli.version).to.equal('0.34.0');
      expect(rc.versions.chart.version).to.equal('0.44.0');
      expect(rc.versions.consensusNode.version).to.equal('0.58.10');
      expect(rc.versions.mirrorNodeChart.version).to.equal('0.122.0');
      expect(rc.versions.explorerChart.version).to.equal('24.12.0');
      expect(rc.versions.jsonRpcRelayChart.version).to.equal('0.63.2');
      expect(rc.clusters.length).to.be.equal(1);
      expect(rc.state.consensusNodes.length).to.be.equal(4);
      expect(rc.state.consensusNodes[0].metadata.id).to.be.equal(1);
      expect(rc.state.consensusNodes[0].metadata.namespace).to.be.equal('solo-alpha-prod');
      expect(rc.state.consensusNodes[0].metadata.cluster).to.be.equal('gke-alpha-prod-us-central1');
      expect(rc.state.consensusNodes[0].metadata.phase).to.be.equal(DeploymentPhase.STARTED);
      expect(rc.state.ledgerPhase).to.be.equal(LedgerPhase.UNINITIALIZED);
    }

    function expectRemoteConfigPlain(object: any) {
      expect(object).to.not.be.undefined.and.to.not.be.null;
      expect(object.history.commands.length).to.be.equal(9);
      expect(object.versions.cli).to.equal('0.34.0');
      expect(object.versions.chart).to.equal('0.44.0');
      expect(object.versions.consensusNode).to.equal('0.58.10');
      expect(object.versions.mirrorNodeChart).to.equal('0.122.0');
      expect(object.versions.explorerChart).to.equal('24.12.0');
      expect(object.versions.jsonRpcRelayChart).to.equal('0.63.2');
      expect(object.clusters.length).to.be.equal(1);
      expect(object.state.consensusNodes.length).to.be.equal(4);
      expect(object.state.consensusNodes[0].metadata.id).to.be.equal(1);
      expect(object.state.consensusNodes[0].metadata.namespace).to.be.equal('solo-alpha-prod');
      expect(object.state.consensusNodes[0].metadata.cluster).to.be.equal('gke-alpha-prod-us-central1');
      expect(object.state.consensusNodes[0].metadata.phase).to.be.equal(DeploymentPhase.STARTED);
      expect(object.state.ledgerPhase).to.be.equal(LedgerPhase.UNINITIALIZED);
    }

    it('should transform plain to class', async (): Promise<void> => {
      const rc: RemoteConfigSchema = plainToInstance(RemoteConfigSchema, plainObject);
      expectRemoteConfigClass(rc);
    });

    it('should transform class to plain', async (): Promise<void> => {
      const rc: RemoteConfigSchema = plainToInstance(RemoteConfigSchema, plainObject);
      const plainRemoteConfigObject = instanceToPlain(rc);
      expectRemoteConfigPlain(plainRemoteConfigObject);
    });

    it('should be able to go from a class to an object back to a class', async (): Promise<void> => {
      const rc: RemoteConfigSchema = plainToInstance(RemoteConfigSchema, plainObject);
      const plainRemoteConfigObject = instanceToPlain(rc);
      const rc2: RemoteConfigSchema = plainToInstance(RemoteConfigSchema, plainRemoteConfigObject);
      expectRemoteConfigClass(rc2);
    });
  });
});
