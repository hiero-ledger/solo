// SPDX-License-Identifier: Apache-2.0

import {after, afterEach, describe} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  deployNetworkTest,
  endToEndTestSuite,
  getTestCluster,
  HEDERA_PLATFORM_VERSION_TAG,
  startNodesTest,
} from '../../test-utility.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {BlockNodeCommand} from '../../../src/commands/block-node.js';
import {type ClusterReference, type ComponentName} from '../../../src/core/config/remote/types.js';
import {type BlockNodeComponent} from '../../../src/core/config/remote/components/block-node-component.js';
import {ComponentTypes} from '../../../src/core/config/remote/enumerations/component-types.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type ExtendedNetServer} from '../../../src/types/index.js';
import {exec} from 'node:child_process';
import {promisify} from 'node:util';
import * as constants from '../../../src/core/constants.js';

const execAsync = promisify(exec);

const testName: string = 'block-node-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
const clusterReference: ClusterReference = getTestCluster();
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, clusterReference);
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);

endToEndTestSuite(testName, argv, {startNodes: false, deployNetwork: false}, bootstrapResp => {
  const {
    opts: {k8Factory, commandInvoker, remoteConfigManager, configManager, logger},
    cmd: {nodeCmd, networkCmd},
  } = bootstrapResp;

  describe('BlockNodeCommand', async () => {
    const blockNodeCommand: BlockNodeCommand = new BlockNodeCommand(bootstrapResp.opts);

    // @ts-expect-error - TS2341: to access private method
    const blockNodeComponentName: ComponentName = blockNodeCommand.getReleaseName();

    after(async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    afterEach(async () => await sleep(Duration.ofMillis(5)));

    it("Should succeed deploying block node with 'add' command", async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());

      await commandInvoker.invoke({
        argv: argv,
        command: BlockNodeCommand.COMMAND_NAME,
        subcommand: 'node add',
        // @ts-expect-error to access private property
        callback: async argv => blockNodeCommand.add(argv),
      });

      remoteConfigManager.components.getComponent<BlockNodeComponent>(ComponentTypes.BlockNode, blockNodeComponentName);
    });

    deployNetworkTest(argv, commandInvoker, networkCmd);

    startNodesTest(argv, commandInvoker, nodeCmd);

    it('Should be able to use the getSingleBlock Method to validate block node connectivity', async (): Promise<void> => {
      const pod: Pod = await k8Factory
        .default()
        .pods()
        .list(namespace, [`app.kubernetes.io/instance=${constants.BLOCK_NODE_RELEASE_NAME}`])
        .then((pods: Pod[]): Pod => pods[0]);

      const srv: ExtendedNetServer = await pod.portForward(8080, 8080);
      try {
        const commandOptions: {cwd: string} = {cwd: './test/data'};

        // Make script executable
        await execAsync('chmod +x ./get-block.sh', commandOptions);

        // Execute script
        const scriptStd: {stdout: string; stderr: string} = await execAsync('sh ./get-block.sh 1', commandOptions);

        expect(scriptStd.stderr).to.equal('');

        const getBlockResponse: {status: string} = JSON.parse(scriptStd.stdout);

        expect(getBlockResponse.status).to.equal('READ_BLOCK_SUCCESS');

        logger.showUserError(scriptStd);
      } finally {
        await pod.stopPortForward(srv);
      }
    });

    it("Should succeed with removing block node with 'destroy' command", async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(2).toMillis());

      configManager.reset();

      await commandInvoker.invoke({
        argv: argv,
        command: BlockNodeCommand.COMMAND_NAME,
        subcommand: 'node destroy',
        // @ts-expect-error to access private property
        callback: async argv => blockNodeCommand.destroy(argv),
      });

      try {
        remoteConfigManager.components.getComponent<BlockNodeComponent>(
          ComponentTypes.BlockNode,
          blockNodeComponentName,
        );
        expect.fail();
      } catch (error) {
        expect(error).to.be.instanceof(SoloError);
      }
    });
  });
});
