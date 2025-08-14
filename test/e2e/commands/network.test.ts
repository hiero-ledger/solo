// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';
import {bootstrapTestVariables, getTemporaryDirectory, HEDERA_PLATFORM_VERSION_TAG} from '../../test-utility.js';
import * as constants from '../../../src/core/constants.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import fs from 'node:fs';
import {Flags as flags} from '../../../src/commands/flags.js';
import {KeyManager} from '../../../src/core/key-manager.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {InitCommand} from '../../../src/commands/init/init.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import os from 'node:os';
import {container} from 'tsyringe-neo';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {ClusterReferenceCommandDefinition} from '../../../src/commands/command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from '../../../src/commands/command-definitions/deployment-command-definition.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';
import {KeysCommandDefinition} from '../../../src/commands/command-definitions/keys-command-definition.js';

describe('NetworkCommand', function networkCommand() {
  this.bail(true);
  const testName = 'network-cmd-e2e';
  const namespace = NamespaceName.of(testName);
  const applicationEnvironmentFileContents = '# row 1\n# row 2\n# row 3';
  const applicationEnvironmentParentDirectory = PathEx.join(getTemporaryDirectory(), 'network-command-test');
  const applicationEnvironmentFilePath = PathEx.join(applicationEnvironmentParentDirectory, 'application.env');

  const argv = Argv.getDefaultArgv(namespace);
  argv.setArg(flags.namespace, namespace.name);
  argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
  argv.setArg(flags.nodeAliasesUnparsed, 'node1');
  argv.setArg(flags.generateGossipKeys, true);
  argv.setArg(flags.generateTlsKeys, true);
  argv.setArg(flags.deployMinio, true);
  argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
  argv.setArg(flags.force, true);
  argv.setArg(flags.applicationEnv, applicationEnvironmentFilePath);
  argv.setArg(flags.loadBalancerEnabled, true);
  argv.setArg(flags.clusterRef, `${argv.getArg(flags.clusterRef)}-${testName}`);

  const temporaryDirectory: string = os.tmpdir();
  const {
    opts: {k8Factory, accountManager, configManager, chartManager, commandInvoker, logger},
    cmd: {networkCmd, clusterCmd, initCmd, nodeCmd, deploymentCmd},
  } = bootstrapTestVariables(testName, argv, {});

  // Setup TLS certificates in a before hook
  before(async function () {
    this.timeout(Duration.ofMinutes(1).toMillis());
    await KeyManager.generateTls(temporaryDirectory, 'grpc');
    await KeyManager.generateTls(temporaryDirectory, 'grpcWeb');
    const localConfig = container.resolve<LocalConfigRuntimeState>(InjectTokens.LocalConfigRuntimeState);
    await localConfig.load();
  });

  argv.setArg(flags.grpcTlsCertificatePath, 'node1=' + PathEx.join(temporaryDirectory, 'grpc.crt'));
  argv.setArg(flags.grpcTlsKeyPath, 'node1=' + PathEx.join(temporaryDirectory, 'grpc.key'));
  argv.setArg(flags.grpcWebTlsCertificatePath, 'node1=' + PathEx.join(temporaryDirectory, 'grpcWeb.crt'));
  argv.setArg(flags.grpcWebTlsKeyPath, 'node1=' + PathEx.join(temporaryDirectory, 'grpcWeb.key'));

  after(async function () {
    this.timeout(Duration.ofMinutes(3).toMillis());

    // await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
    // await k8Factory.default().namespaces().delete(namespace);
    // await accountManager.close();
  });

  before(async () => {
    this.timeout(Duration.ofMinutes(1).toMillis());
    await k8Factory.default().namespaces().delete(namespace);

    // @ts-expect-error: TODO: Remove once the init command is removed
    await commandInvoker.invoke({
      argv: argv,
      command: InitCommand.COMMAND_NAME,
      callback: async (argv): Promise<boolean> => initCmd.init(argv),
    });

    await commandInvoker.invoke({
      argv: argv,
      command: ClusterReferenceCommandDefinition.COMMAND_NAME,
      subcommand: ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      action: ClusterReferenceCommandDefinition.CONFIG_SETUP,
      callback: async (argv): Promise<boolean> => clusterCmd.handlers.setup(argv),
    });

    await commandInvoker.invoke({
      argv: argv,
      command: ClusterReferenceCommandDefinition.COMMAND_NAME,
      subcommand: ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      action: ClusterReferenceCommandDefinition.CONFIG_CONNECT,
      callback: async (argv): Promise<boolean> => clusterCmd.handlers.connect(argv),
    });

    fs.mkdirSync(applicationEnvironmentParentDirectory, {recursive: true});
    fs.writeFileSync(applicationEnvironmentFilePath, applicationEnvironmentFileContents);
  });

  it('deployment config create should succeed', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: DeploymentCommandDefinition.COMMAND_NAME,
      subcommand: DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      action: DeploymentCommandDefinition.CONFIG_CREATE,
      callback: async (argv): Promise<boolean> => deploymentCmd.create(argv),
    });

    argv.setArg(flags.nodeAliasesUnparsed, undefined);
    configManager.reset();
    configManager.update(argv.build());
  });

  it('cluster-ref config attach should succeed', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: DeploymentCommandDefinition.COMMAND_NAME,
      subcommand: DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_NAME,
      action: DeploymentCommandDefinition.CLUSTER_ATTACH,
      callback: async (argv): Promise<boolean> => deploymentCmd.addCluster(argv),
    });

    argv.setArg(flags.nodeAliasesUnparsed, undefined);
    configManager.reset();
    configManager.update(argv.build());
  });

  it('keys should be generated', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: KeysCommandDefinition.COMMAND_NAME,
      subcommand: KeysCommandDefinition.CONSENSUS_SUBCOMMAND_NAME,
      action: KeysCommandDefinition.CONSENSUS_GENERATE,
      callback: async (argv): Promise<boolean> => nodeCmd.handlers.keys(argv),
    });
  });

  it('consensus network deploy command should succeed', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: ConsensusCommandDefinition.COMMAND_NAME,
      subcommand: ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      action: ConsensusCommandDefinition.NETWORK_DEPLOY,
      callback: async (argv): Promise<boolean> => networkCmd.deploy(argv),
    });

    // check pod names should match expected values
    await expect(
      k8Factory
        .default()
        .pods()
        .read(PodReference.of(namespace, PodName.of('network-node1-0'))),
    ).eventually.to.have.nested.property('podReference.name.name', 'network-node1-0');
    // get list of pvc using k8 pvcs list function and print to log
    const pvcs = await k8Factory.default().pvcs().list(namespace, []);
    logger.showList('PVCs', pvcs);
  }).timeout(Duration.ofMinutes(4).toMillis());

  it('application env file contents should be in cached values file', () => {
    // @ts-expect-error - TS2341: to access private property
    const valuesYaml = fs.readFileSync(Object.values(networkCmd.profileValuesFile)[0]).toString();
    const fileRows = applicationEnvironmentFileContents.split('\n');
    for (const fileRow of fileRows) {
      expect(valuesYaml).to.contain(fileRow);
    }
  });

  it('consensus network destroy should success', async () => {
    argv.setArg(flags.deletePvcs, true);
    argv.setArg(flags.deleteSecrets, true);
    argv.setArg(flags.force, true);
    configManager.update(argv.build());

    try {
      await commandInvoker.invoke({
        argv: argv,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.NETWORK_DESTROY,
        callback: async (argv): Promise<boolean> => networkCmd.destroy(argv),
      });

      while ((await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node'])).length > 0) {
        logger.debug('Pods are still running. Waiting...');
        await sleep(Duration.ofSeconds(3));
      }

      while ((await k8Factory.default().pods().list(namespace, ['app=minio'])).length > 0) {
        logger.showUser('Waiting for minio container to be deleted...');
        await sleep(Duration.ofSeconds(3));
      }

      // check if chart is uninstalled
      const chartInstalledStatus = await chartManager.isChartInstalled(namespace, constants.SOLO_DEPLOYMENT_CHART);
      expect(chartInstalledStatus).to.be.false;

      // check if pvc are deleted
      await expect(k8Factory.default().pvcs().list(namespace, [])).eventually.to.have.lengthOf(0);

      // check if secrets are deleted
      await expect(k8Factory.default().secrets().list(namespace)).eventually.to.have.lengthOf(0);
    } catch (error) {
      logger.showUserError(error);
      expect.fail();
    }
  }).timeout(Duration.ofMinutes(2).toMillis());
});
