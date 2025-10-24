// SPDX-License-Identifier: Apache-2.0

import {afterEach, describe} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {deployNetworkTest, endToEndTestSuite, getTestCluster, startNodesTest} from '../../test-utility.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type BlockNodeCommand} from '../../../src/commands/block-node.js';
import {ComponentTypes} from '../../../src/core/config/remote/enumerations/component-types.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type ClusterReferenceName} from '../../../src/types/index.js';
import {exec} from 'node:child_process';
import {promisify} from 'node:util';
import * as SemVer from 'semver';
import {type BlockNodeStateSchema} from '../../../src/data/schema/model/remote/state/block-node-state-schema.js';
import {Templates} from '../../../src/core/templates.js';
import * as constants from '../../../src/core/constants.js';
import {BlockCommandDefinition} from '../../../src/commands/command-definitions/block-command-definition.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';

// eslint-disable-next-line @typescript-eslint/typedef
const execAsync = promisify(exec);

const testName: string = 'block-node-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
const clusterReference: ClusterReferenceName = getTestCluster();
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, clusterReference);
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);

endToEndTestSuite(testName, argv, {startNodes: false, deployNetwork: false}, bootstrapResp => {
  describe('BlockNodeCommand', async (): Promise<void> => {
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars,unused-imports/no-unused-vars
      opts: {k8Factory, commandInvoker, remoteConfig, configManager, logger},
      cmd: {nodeCmd, networkCmd},
    } = bootstrapResp;

    let blockNodeCommand: BlockNodeCommand;
    let platformVersion: SemVer.SemVer;

    before(async (): Promise<void> => {
      blockNodeCommand = container.resolve(InjectTokens.BlockNodeCommand);
      platformVersion = new SemVer.SemVer(argv.getArg(flags.releaseTag));
      if (
        SemVer.lt(
          platformVersion,
          new SemVer.SemVer(version.MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE_LEGACY_RELEASE),
        )
      ) {
        expect.fail(
          `BlockNodeCommand should not be tested with versions less than ${version.MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE_LEGACY_RELEASE}`,
        );
      }
    });

    after(async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(5).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    afterEach(async (): Promise<void> => await sleep(Duration.ofMillis(5)));

    it("Should succeed deploying block node with 'add' command", async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(5).toMillis());

      await commandInvoker.invoke({
        argv: argv,
        command: BlockCommandDefinition.COMMAND_NAME,
        subcommand: BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
        action: BlockCommandDefinition.NODE_ADD,
        callback: async (argv: {_: string[]} & Record<string, any>): Promise<boolean> => blockNodeCommand.add(argv),
      });

      remoteConfig.configuration.components.getComponent<BlockNodeStateSchema>(ComponentTypes.BlockNode, 1);
    });

    deployNetworkTest(argv, commandInvoker, networkCmd);

    startNodesTest(argv, commandInvoker, nodeCmd);

    it('Should be able to use the getSingleBlock Method to validate block node connectivity', async (): Promise<void> => {
      const pod: Pod = await k8Factory
        .default()
        .pods()
        .list(namespace, Templates.renderBlockNodeLabels(1))
        .then((pods: Pod[]): Pod => pods[0]);

      const srv: number = await pod.portForward(constants.BLOCK_NODE_PORT, constants.BLOCK_NODE_PORT);
      const commandOptions: {cwd: string} = {cwd: './test/data'};

      // Make script executable
      await execAsync('chmod +x ./get-block.sh', commandOptions);

      // Execute script
      const scriptStd: {stdout: string; stderr: string} = await execAsync('./get-block.sh 1', commandOptions);

      expect(scriptStd.stderr).to.equal('');
      expect(scriptStd.stdout).to.include('"status": "SUCCESS"');

      await pod.stopPortForward(srv);
    });

    it('Should write log metrics', async (): Promise<void> => {
      await new MetricsServerImpl().logMetrics(testName, PathEx.join(constants.SOLO_LOGS_DIR, `${testName}`));
    });

    it("Should succeed with removing block node with 'destroy' command", async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(2).toMillis());

      configManager.reset();

      await commandInvoker.invoke({
        argv: argv,
        command: BlockCommandDefinition.COMMAND_NAME,
        subcommand: BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
        action: BlockCommandDefinition.NODE_DESTROY,
        callback: async (argv: {_: string[]} & Record<string, any>): Promise<boolean> => blockNodeCommand.destroy(argv),
      });

      try {
        remoteConfig.configuration.components.getComponent<BlockNodeStateSchema>(ComponentTypes.BlockNode, 0);
        expect.fail();
      } catch (error) {
        expect(error).to.be.instanceof(SoloError);
      }
    });
  });
});
