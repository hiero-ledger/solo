// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {type BaseTestOptions} from './base-test-options.js';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {
  type PodmanDependencyManager,
  type KindDependencyManager,
} from '../../../../src/core/dependency-managers/index.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8ClientFactory} from '../../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type DefaultKindClientBuilder} from '../../../../src/integration/kind/impl/default-kind-client-builder.js';
import {type KindClient} from '../../../../src/integration/kind/kind-client.js';
import {type SemVer} from 'semver';
import {Duration} from '../../../../src/core/time/duration.js';
import {sleep} from '../../../../src/core/helpers.js';
import * as version from '../../../../version.js';
import {Argv} from '../../../helpers/argv-wrapper.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {ClusterReferenceCommandDefinition} from '../../../../src/commands/command-definitions/cluster-reference-command-definition.js';
import {bootstrapTestVariables} from '../../../test-utility.js';
import {HEDERA_PLATFORM_VERSION_TAG} from '../../../test-utility.js';
import {main} from '../../../../src/index.js';
import {InitCommand} from '../../../../src/commands/init/init.js';
import * as constants from '../../../../src/core/constants.js';
import path from 'node:path';

export class PodmanKindSetupTest extends BaseCommandTest {
  /**
   * Test Podman installation
   * Note: This test ALWAYS installs Podman regardless of Docker availability
   * to specifically test Podman installation and Kind with Podman integration.
   */
  public static async testPodmanInstallation(options: BaseTestOptions): Promise<void> {
    const {testName, testLogger} = options;

    it(`${testName}: should install podman (forced)`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning podman installation (Docker will be ignored if present)`);

      const podmanManager = container.resolve<PodmanDependencyManager>(InjectTokens.PodmanDependencyManager);

      // Force install podman regardless of Docker availability
      testLogger.info(`${testName}: forcing podman installation for E2E test`);
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
      testLogger.info(`${testName}: finished podman installation check`);
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  /**
   * Test Kind installation and cluster creation using InitCommand tasks
   */
  public static async testKindClusterCreation(options: BaseTestOptions): Promise<void> {
    const {testName, testLogger, contexts} = options;

    it(`${testName}: should setup podman machine and create cluster`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning cluster setup`);

      // Extract cluster name from context (remove 'kind-' prefix if present)
      const contextName = contexts[0];
      const clusterName = contextName.startsWith('kind-') ? contextName.slice(5) : contextName;

      // Setup Podman machine FIRST (before trying to use Podman/Kind)
      testLogger.info(`${testName}: setting up Podman machine`);
      const podmanManager = container.resolve<PodmanDependencyManager>(InjectTokens.PodmanDependencyManager);
      const podmanExecutable = await podmanManager.getExecutablePath();
      
      // Check if Podman machine exists and has sufficient resources
      const {exec} = await import('node:child_process');
      const {promisify} = await import('node:util');
      const execAsync = promisify(exec);
      
      const REQUIRED_MEMORY_GB = 8; // Minimum 8GB for Kubernetes
      const RECOMMENDED_MEMORY_MB = 16384; // 16GB recommended
      const RECOMMENDED_CPUS = 4;
      
      try {
        const {stdout} = await execAsync(`${podmanExecutable} machine list --format json`);
        const machines = JSON.parse(stdout || '[]');
        
        let needsRecreate = false;
        
        if (machines.length === 0) {
          testLogger.info(`${testName}: no Podman machine found, creating new one`);
          needsRecreate = true;
        } else {
          const machine = machines[0];
          testLogger.info(`${testName}: found Podman machine with ${machine.Memory} memory and ${machine.CPUs} CPUs`);
          
          // Parse memory (format: "2GiB", "16GiB", etc.)
          const memoryMatch = machine.Memory?.match(/(\d+(?:\.\d+)?)\s*(GiB|MiB)/);
          let memoryGB = 0;
          if (memoryMatch) {
            const value = parseFloat(memoryMatch[1]);
            const unit = memoryMatch[2];
            memoryGB = unit === 'GiB' ? value : value / 1024;
          }
          
          // Check if resources are insufficient
          if (memoryGB < REQUIRED_MEMORY_GB) {
            testLogger.warn(`${testName}: Podman machine has insufficient memory: ${memoryGB}GB (minimum ${REQUIRED_MEMORY_GB}GB required)`);
            needsRecreate = true;
          } else if (machine.CPUs < 2) {
            testLogger.warn(`${testName}: Podman machine has insufficient CPUs: ${machine.CPUs} (minimum 2 required)`);
            needsRecreate = true;
          } else if (!machine.Running) {
            testLogger.info(`${testName}: Podman machine exists but not running, starting it`);
            await execAsync(`${podmanExecutable} machine start`);
          } else {
            testLogger.info(`${testName}: Podman machine has sufficient resources (${memoryGB}GB RAM, ${machine.CPUs} CPUs) and is running`);
          }
        }
        
        if (needsRecreate) {
          testLogger.info(`${testName}: recreating Podman machine with ${RECOMMENDED_MEMORY_MB}MB (${RECOMMENDED_MEMORY_MB/1024}GB) RAM and ${RECOMMENDED_CPUS} CPUs`);
          
          // Stop and remove existing machine if present
          if (machines.length > 0) {
            testLogger.info(`${testName}: stopping existing Podman machine`);
            await execAsync(`${podmanExecutable} machine stop`).catch(() => {});
            await sleep(Duration.ofSeconds(2));
            testLogger.info(`${testName}: removing existing Podman machine`);
            await execAsync(`${podmanExecutable} machine rm -f podman-machine-default`).catch(() => {});
            await sleep(Duration.ofSeconds(2));
          }
          
          // Create new machine with proper resources
          testLogger.info(`${testName}: creating new Podman machine (this may take a few minutes)`);
          await execAsync(`${podmanExecutable} machine init --memory=${RECOMMENDED_MEMORY_MB} --cpus=${RECOMMENDED_CPUS} --disk-size=100`);
          testLogger.info(`${testName}: starting Podman machine`);
          await execAsync(`${podmanExecutable} machine start`);
          testLogger.info(`${testName}: Podman machine created and started successfully with ${RECOMMENDED_MEMORY_MB/1024}GB RAM and ${RECOMMENDED_CPUS} CPUs`);
        }
      } catch (error) {
        testLogger.error(`${testName}: error setting up Podman machine: ${error.message}`);
        throw new Error(`Failed to setup Podman machine: ${error.message}`);
      }

      // Configure environment for Kind to use Podman
      const podmanInstallationDirectory = container.resolve<string>(InjectTokens.PodmanInstallationDir);
      process.env.PATH = `${podmanInstallationDirectory}${path.delimiter}${process.env.PATH}`;
      process.env.KIND_EXPERIMENTAL_PROVIDER = 'podman';
      testLogger.info(`${testName}: configured Kind to use Podman`);

      // Install Kind if not already installed
      testLogger.info(`${testName}: installing Kind`);
      const kindManager = container.resolve<KindDependencyManager>(InjectTokens.KindDependencyManager);
      await kindManager.install();
      const kindExecutable = await kindManager.getExecutablePath();
      testLogger.info(`${testName}: Kind installed at ${kindExecutable}`);
      const kindClientBuilder = container.resolve<DefaultKindClientBuilder>(InjectTokens.KindBuilder);
      const kindClient: KindClient = await kindClientBuilder.executable(kindExecutable).build();

      // Delete existing cluster if present (now that Podman machine is running)
      try {
        const existingClusters = await kindClient.getClusters();
        const existingClusterNames = existingClusters.map(c => c.name);
        
        if (existingClusterNames.includes(clusterName)) {
          testLogger.info(`${testName}: cluster ${clusterName} already exists, deleting it first`);
          await kindClient.deleteCluster(clusterName);
          await sleep(Duration.ofSeconds(5));
        }
      } catch (error) {
        testLogger.info(`${testName}: no existing clusters to clean up (${error.message})`);
      }

      // Create Kind cluster
      testLogger.info(`${testName}: creating Kind cluster`);
      const createResponse = await kindClient.createCluster(constants.DEFAULT_CLUSTER);
      testLogger.info(`${testName}: cluster created: ${createResponse.name}`);

      // Wait for cluster to be ready
      await sleep(Duration.ofSeconds(10));

      // Verify cluster was created
      const clusters = await kindClient.getClusters();
      const clusterNames = clusters.map(c => c.name);
      testLogger.info(`${testName}: clusters after creation: ${clusterNames.join(', ')}`);
      expect(clusterNames.length).to.be.greaterThan(0);

      testLogger.info(`${testName}: finished cluster setup`);
    }).timeout(Duration.ofMinutes(15).toMillis());
  }

  /**
   * Test cluster-ref setup and network deployment
   */
  public static async testNodeDeployment(options: BaseTestOptions): Promise<void> {
    const {testName, testLogger, namespace, contexts} = options;

    it(`${testName}: should setup cluster-ref config`, async (): Promise<void> => {
      testLogger.info(`${testName}: setting up cluster-ref config`);

      // Build command line args for cluster-ref config setup
      const argv: string[] = BaseCommandTest.newArgv();
      argv.push(
        ClusterReferenceCommandDefinition.COMMAND_NAME,
        ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME,
        ClusterReferenceCommandDefinition.CONFIG_SETUP,
        BaseCommandTest.optionFromFlag(flags.clusterRef),
        contexts[0],
        BaseCommandTest.optionFromFlag(flags.clusterSetupNamespace),
        'solo-setup',
      );
      BaseCommandTest.argvPushGlobalFlags(argv, testName, false, true);

      testLogger.info(`${testName}: calling cluster-ref config setup`);

      // Call cluster-ref config setup via main()
      await main(argv);

      testLogger.info(`${testName}: cluster-ref config setup completed`);
    }).timeout(Duration.ofMinutes(5).toMillis());

    it(`${testName}: should deploy network to cluster`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning network deployment`);

      // Setup argv for network deployment
      const argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.clusterRef, contexts[0]);
      argv.setArg(flags.namespace, namespace.name);
      argv.setArg(flags.nodeAliasesUnparsed, 'node1');
      argv.setArg(flags.generateGossipKeys, true);
      argv.setArg(flags.generateTlsKeys, true);
      argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
      argv.setArg(flags.force, true);

      // Bootstrap test variables to get command instances
      const {
        opts: {commandInvoker},
        cmd: {networkCmd},
      } = bootstrapTestVariables(testName, argv, {});

      testLogger.info(`${testName}: deploying network with node1`);

      // Deploy network
      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NETWORK_DEPLOY,
        callback: async (argv): Promise<boolean> => networkCmd.deploy(argv),
      });

      testLogger.info(`${testName}: network deployed successfully`);
    }).timeout(Duration.ofMinutes(8).toMillis());

    it(`${testName}: should setup and start nodes`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning node setup and start`);

      // Setup argv for node operations
      const argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.clusterRef, contexts[0]);
      argv.setArg(flags.namespace, namespace.name);
      argv.setArg(flags.nodeAliasesUnparsed, 'node1');

      // Bootstrap to get command instances
      const {
        opts: {commandInvoker},
        cmd: {nodeCmd},
      } = bootstrapTestVariables(testName, argv, {});

      testLogger.info(`${testName}: setting up nodes`);

      // Setup nodes
      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NODE_SETUP,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.setup(argv),
      });

      testLogger.info(`${testName}: starting nodes`);

      // Start nodes
      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NODE_START,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.start(argv),
      });

      testLogger.info(`${testName}: nodes started successfully`);

      // Wait for nodes to be ready
      await sleep(Duration.ofSeconds(30));

      testLogger.info(`${testName}: finished node setup and start`);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  /**
   * Test destroying the network
   */
  public static async testNetworkDestroy(options: BaseTestOptions): Promise<void> {
    const {testName, testLogger, namespace, contexts} = options;

    it(`${testName}: should destroy network`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning network destroy`);

      // Setup argv
      const argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.clusterRef, contexts[0]);
      argv.setArg(flags.namespace, namespace.name);

      // Bootstrap to get command instances
      const {
        opts: {commandInvoker},
        cmd: {networkCmd},
      } = bootstrapTestVariables(testName, argv, {});

      testLogger.info(`${testName}: destroying network`);

      // Destroy network
      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NETWORK_DESTROY,
        callback: async (argv): Promise<boolean> => networkCmd.destroy(argv),
      });

      testLogger.info(`${testName}: network destroyed successfully`);
    }).timeout(Duration.ofMinutes(5).toMillis());
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
      const clusterName = contextName.startsWith('kind-') ? contextName.slice(5) : contextName;

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
