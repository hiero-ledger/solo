// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it, after} from 'mocha';
import {DefaultKindClientBuilder} from '../../../../../src/integration/kind/impl/default-kind-client-builder.js';
import {type KindClient} from '../../../../../src/integration/kind/kind-client.js';
import {ClusterCreateOptionsBuilder} from '../../../../../src/integration/kind/model/create-cluster/create-cluster-options-builder.js';
import {KindCluster} from '../../../../../src/integration/kind/model/kind-cluster.js';
import {KindDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {container} from 'tsyringe-neo';
import fs from 'node:fs';
import path from 'node:path';
import * as os from 'node:os';
import {type GetKubeConfigResponse} from '../../../../../src/integration/kind/model/get-kubeconfig/get-kubeconfig-response.js';
import {type GetNodesResponse} from '../../../../../src/integration/kind/model/get-nodes/get-nodes-response.js';
import {type ExportKubeConfigResponse} from '../../../../../src/integration/kind/model/export-kubeconfig/export-kubeconfig-response.js';
import {type SemVer} from 'semver';
import {type ClusterCreateOptions} from '../../../../../src/integration/kind/model/create-cluster/cluster-create-options.js';
import {type ClusterCreateResponse} from '../../../../../src/integration/kind/model/create-cluster/cluster-create-response.js';
import {type ClusterDeleteResponse} from '../../../../../src/integration/kind/model/delete-cluster/cluster-delete-response.js';
import {resetForTest} from '../../../../test-container.js';
import {Duration} from '../../../../../src/core/time/duration.js';
import {exec} from 'node:child_process';
import {promisify} from 'node:util';

const execAsync = promisify(exec);

describe('KindClient Integration Tests', function () {
  this.timeout(Duration.ofMinutes(1).toMillis());

  let kindClient: KindClient;
  let kindPath: string;
  const testClusterName: string = 'test-kind-client';
  const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'kind-test-'));
  let originalKubeConfigContext: string | null = null;

  before(async () => {
    resetForTest();

    // Save original kubectl context if it exists
    try {
      const {stdout} = await execAsync('kubectl config current-context');
      originalKubeConfigContext = stdout.trim();
      console.log(`Saved original kubectl context: ${originalKubeConfigContext}`);
    } catch {
      console.log('No kubectl context found or kubectl not available');
      originalKubeConfigContext = null;
    }

    // Download and install Kind
    const kindManager: KindDependencyManager = container.resolve(KindDependencyManager);
    await kindManager.install(temporaryDirectory);
    kindPath = await kindManager.getExecutablePath();

    console.log(`Using Kind at: ${kindPath}`);

    // Create Kind client
    const clientBuilder: DefaultKindClientBuilder = new DefaultKindClientBuilder();
    kindClient = await clientBuilder.executable(kindPath).build();
  });

  after(async () => {
    if (kindClient) {
      try {
        // Clean up test cluster if it exists
        const clusters: KindCluster[] = await kindClient.getClusters();
        if (clusters.some((cluster: KindCluster): boolean => cluster.name === testClusterName)) {
          console.log(`Deleting test cluster: ${testClusterName}`);
          await kindClient.deleteCluster(testClusterName);
        }
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    }

    // Restore original kubectl context if it existed
    if (originalKubeConfigContext) {
      try {
        console.log(`Restoring original kubectl context: ${originalKubeConfigContext}`);
        await execAsync(`kubectl config use-context ${originalKubeConfigContext}`);
      } catch (error) {
        console.error('Error restoring kubectl context:', error);
      }
    }

    // Clean up temp directory
    try {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    } catch (error) {
      console.error('Error cleaning up temp directory:', error);
    }
  });

  it('should get Kind version', async () => {
    const version: SemVer = await kindClient.version();
    expect(version).to.not.be.undefined;
    expect(version.major).to.be.a('number');
    expect(version.minor).to.be.a('number');
    expect(version.patch).to.be.a('number');
    console.log(`Kind version: ${version.toString()}`);
  });

  it('should create a cluster', async (): Promise<void> => {
    // after the Kubernetes upgrade in CI, kind commands sometimes fail initially due to a timeout when creating clusters
    const maxRetries: number = 3;
    let attempt: number = 0;
    let lastError: unknown;

    while (attempt < maxRetries) {
      try {
        const controller: AbortController = new AbortController();
        const onTimeoutCallback: NodeJS.Timeout = setTimeout((): void => {
          controller.abort();
        }, Duration.ofSeconds(1).toMillis());
        console.log(`deleting cluster if it exists before creation attempt ${attempt + 1}`);
        await kindClient.deleteCluster(testClusterName);
        const options: ClusterCreateOptions = ClusterCreateOptionsBuilder.builder().build();

        console.log(`creating cluster, attempt ${attempt + 1}`);
        const response: ClusterCreateResponse = await kindClient.createCluster(testClusterName, options);
        expect(response).to.not.be.undefined;
        expect(response.name).to.equal(testClusterName);
        clearTimeout(onTimeoutCallback);
        return;
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt + 1} to create cluster failed: ${error}`);
        attempt++;
        if (attempt < maxRetries) {
          console.log('Retrying cluster creation...');
        } else {
          console.error('Max retries reached. Failing test.');
          throw lastError;
        }
      }
    }
  }).timeout(Duration.ofMinutes(4).toMillis());

  it('should list clusters', async () => {
    const clusters: KindCluster[] = await kindClient.getClusters();
    expect(clusters).to.be.an('array');
    expect(clusters.length).to.be.greaterThan(0);

    const testCluster: KindCluster = clusters.find(c => c.name === testClusterName);
    expect(testCluster).to.not.be.undefined;
    expect(testCluster).to.be.instanceOf(KindCluster);
    expect(testCluster!.name).to.equal(testClusterName);
  });

  it('should get cluster nodes', async () => {
    const response: GetNodesResponse = await kindClient.getNodes(testClusterName);
    expect(response).to.not.be.undefined;
    expect(response.nodes).to.be.an('array');
    expect(response.nodes.length).to.be.greaterThan(0);

    // Verify node naming pattern (should have the cluster name in it)
    const nodes: string[] = response.nodes;
    for (const node of nodes) {
      expect(node).to.include(testClusterName);
    }
  });

  it('should get kubeconfig', async () => {
    const response: GetKubeConfigResponse = await kindClient.getKubeConfig(testClusterName);
    expect(response).to.not.be.undefined;
    expect(response.config).to.exist;
    expect(response.config.apiVersion).to.eq('v1');
    expect(response.config.clusters).to.exist;
    expect(response.config.clusters.length).to.be.greaterThan(0);
    expect(response.config.contexts).to.exist;
  });

  it('should export kubeconfig', async () => {
    const response: ExportKubeConfigResponse = await kindClient.exportKubeConfig(testClusterName);
    expect(response).to.not.be.undefined;
    expect(response.kubeConfigContext).to.be.a('string');
  });

  it('should export logs', async () => {
    const response = await kindClient.exportLogs(testClusterName);
    expect(response).to.not.be.undefined;
    expect(response.exportPath).to.be.a('string');

    // Verify logs directory exists
    const logsExist: boolean = fs.existsSync(response.exportPath!);
    expect(logsExist).to.be.true;
  });

  it('should delete a cluster', async () => {
    const response: ClusterDeleteResponse = await kindClient.deleteCluster(testClusterName);
    expect(response).to.not.be.undefined;

    // Verify cluster was deleted
    const clusters: KindCluster[] = await kindClient.getClusters();
    const deletedCluster: KindCluster = clusters.find((c: KindCluster): boolean => c.name === testClusterName);
    expect(deletedCluster).to.be.undefined;
  });
});
