// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {type BaseTestOptions} from './base-test-options.js';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {PodmanDependencyManager, KindDependencyManager} from '../../../../src/core/dependency-managers/index.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {DefaultKindClientBuilder} from '../../../../src/integration/kind/impl/default-kind-client-builder.js';
import {type KindClient} from '../../../../src/integration/kind/kind-client.js';
import {type SemVer} from 'semver';
import {Duration} from '../../../../src/core/time/duration.js';
import {sleep} from '../../../../src/core/helpers.js';
import * as version from '../../../../version.js';

export class PodmanKindSetupTest extends BaseCommandTest {
  /**
   * Test Podman installation
   */
  public static async testPodmanInstallation(options: BaseTestOptions): Promise<void> {
    const {testName, testLogger} = options;

    it(`${testName}: should install or verify podman`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning podman installation check`);

      const podmanManager = container.resolve<PodmanDependencyManager>(InjectTokens.PodmanDependencyManager);

      // Check if podman should be installed
      const shouldInstall = await podmanManager.shouldInstall();
      testLogger.info(`${testName}: podman should install: ${shouldInstall}`);

      if (shouldInstall) {
        // Install podman
        const installed = await podmanManager.install();
        expect(installed).to.be.true;
        testLogger.info(`${testName}: podman installed successfully`);

        // Verify installation
        const executablePath = await podmanManager.getExecutablePath();
        testLogger.info(`${testName}: podman executable path: ${executablePath}`);
        expect(executablePath).to.not.be.empty;

        // Check version
        const podmanVersion = await podmanManager.getVersion(executablePath);
        testLogger.info(`${testName}: podman version: ${podmanVersion}`);
        expect(podmanVersion).to.not.be.empty;
      } else {
        testLogger.info(`${testName}: podman installation not required (Docker is available)`);
      }

      testLogger.info(`${testName}: finished podman installation check`);
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  /**
   * Test Kind installation and cluster creation
   */
  public static async testKindClusterCreation(options: BaseTestOptions): Promise<void> {
    const {testName, testLogger, contexts} = options;

    it(`${testName}: should install or verify kind`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning kind installation check`);

      const kindManager = container.resolve<KindDependencyManager>(InjectTokens.KindDependencyManager);

      // Install kind if needed
      const installed = await kindManager.install();
      expect(installed).to.be.true;
      testLogger.info(`${testName}: kind installed successfully`);

      // Verify installation
      const executablePath = await kindManager.getExecutablePath();
      testLogger.info(`${testName}: kind executable path: ${executablePath}`);
      expect(executablePath).to.not.be.empty;

      // Check version by creating a client
      const kindClientBuilder = container.resolve<DefaultKindClientBuilder>(InjectTokens.KindBuilder);
      const kindClient: KindClient = await kindClientBuilder.executable(executablePath).build();
      const kindVersion: SemVer = await kindClient.version();
      testLogger.info(`${testName}: kind version: ${kindVersion.version}`);
      expect(kindVersion.version).to.equal(version.KIND_VERSION);

      testLogger.info(`${testName}: finished kind installation check`);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it(`${testName}: should create kind cluster automatically`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning kind cluster creation`);

      const kindManager = container.resolve<KindDependencyManager>(InjectTokens.KindDependencyManager);
      const executablePath = await kindManager.getExecutablePath();
      const kindClientBuilder = container.resolve<DefaultKindClientBuilder>(InjectTokens.KindBuilder);
      const kindClient: KindClient = await kindClientBuilder.executable(executablePath).build();
      
      // Extract cluster name from context (remove 'kind-' prefix if present)
      const contextName = contexts[0];
      const clusterName = contextName.startsWith('kind-') ? contextName.substring(5) : contextName;

      // Get list of existing clusters
      const existingClusters = await kindClient.getClusters();
      const existingClusterNames = existingClusters.map(c => c.name);
      testLogger.info(`${testName}: existing clusters: ${existingClusterNames.join(', ')}`);

      // Check if cluster already exists
      const clusterExists = existingClusterNames.includes(clusterName);
      if (clusterExists) {
        testLogger.info(`${testName}: cluster ${clusterName} already exists, deleting it first`);
        await kindClient.deleteCluster(clusterName);
        await sleep(Duration.ofSeconds(5));
      }

      // Create new cluster
      testLogger.info(`${testName}: creating cluster: ${clusterName}`);
      const createResponse = await kindClient.createCluster(clusterName);
      expect(createResponse).to.not.be.undefined;
      expect(createResponse.name).to.equal(clusterName);
      testLogger.info(`${testName}: cluster created: ${createResponse.name}`);

      // Wait for cluster to be ready
      await sleep(Duration.ofSeconds(10));

      // Verify cluster exists
      const clusters = await kindClient.getClusters();
      const clusterNames = clusters.map(c => c.name);
      testLogger.info(`${testName}: clusters after creation: ${clusterNames.join(', ')}`);
      expect(clusterNames).to.include(clusterName);

      testLogger.info(`${testName}: finished kind cluster creation`);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  /**
   * Test cluster cleanup
   */
  public static async testClusterCleanup(options: BaseTestOptions): Promise<void> {
    const {testName, testLogger, contexts} = options;

    it(`${testName}: should cleanup kind cluster`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning cluster cleanup`);

      const kindManager = container.resolve<KindDependencyManager>(InjectTokens.KindDependencyManager);
      const executablePath = await kindManager.getExecutablePath();
      const kindClientBuilder = container.resolve<DefaultKindClientBuilder>(InjectTokens.KindBuilder);
      const kindClient: KindClient = await kindClientBuilder.executable(executablePath).build();
      
      // Extract cluster name from context
      const contextName = contexts[0];
      const clusterName = contextName.startsWith('kind-') ? contextName.substring(5) : contextName;

      // Delete cluster
      testLogger.info(`${testName}: deleting cluster: ${clusterName}`);
      const deleteResponse = await kindClient.deleteCluster(clusterName);
      expect(deleteResponse).to.not.be.undefined;
      testLogger.info(`${testName}: cluster deleted successfully`);

      // Wait for cleanup
      await sleep(Duration.ofSeconds(5));

      // Verify cluster is deleted
      const clusters = await kindClient.getClusters();
      const clusterNames = clusters.map(c => c.name);
      testLogger.info(`${testName}: clusters after deletion: ${clusterNames.join(', ')}`);
      expect(clusterNames).to.not.include(clusterName);

      testLogger.info(`${testName}: finished cluster cleanup`);
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
