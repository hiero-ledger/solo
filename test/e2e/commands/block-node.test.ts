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
import {ComponentTypes} from '../../../src/core/config/remote/enumerations/component-types.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type ClusterReference, type ExtendedNetServer} from '../../../src/types/index.js';
import {exec} from 'node:child_process';
import {promisify} from 'node:util';
import * as constants from '../../../src/core/constants.js';
import {lt, SemVer} from 'semver';
import {type ArgvStruct} from '../../../src/types/aliases.js';
import {type BlockNodeStateSchema} from '../../../src/data/schema/model/remote/state/block-node-state-schema.js';

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
    opts: {k8Factory, commandInvoker, remoteConfig, configManager, logger},
    cmd: {nodeCmd, networkCmd},
  } = bootstrapResp;

  describe('BlockNodeCommand', async () => {
    let blockNodeCommand: BlockNodeCommand;

    before((): void => {
      blockNodeCommand = container.resolve(InjectTokens.BlockNodeCommand);
    });

    // @ts-expect-error - TS2341: to access private method
    const blockNodeComponentName: ComponentName = blockNodeCommand.getReleaseName();

    after(async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    afterEach(async () => await sleep(Duration.ofMillis(5)));

    it('Should fail with versions less than 0.62.0', async () => {
      const argvClone: Argv = argv.clone();
      argvClone.setArg(flags.releaseTag, 'v0.61.0');

      try {
        await commandInvoker.invoke({
          argv: argv,
          command: BlockNodeCommand.COMMAND_NAME,
          subcommand: 'node add',
          // @ts-expect-error to access private property
          callback: async (argv: ArgvStruct): Promise<boolean> => blockNodeCommand.add(argv),
        });

        expect.fail();
      } catch (error) {
        expect(error.message).to.include('Hedera platform versions less than');
      }
    });

    const platformVersion: SemVer = new SemVer(argv.getArg<string>(flags.releaseTag));
    if (lt(platformVersion, new SemVer('v0.62.0'))) {
      return;
    }

    it("Should succeed deploying block node with 'add' command", async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());

      await commandInvoker.invoke({
        argv: argv,
        command: BlockNodeCommand.COMMAND_NAME,
        subcommand: 'node add',
        // @ts-expect-error to access private property
        callback: async argv => blockNodeCommand.add(argv),
      });

      remoteConfig.configuration.components.getComponent<BlockNodeStateSchema>(
        ComponentTypes.BlockNode,
        blockNodeComponentName,
      );
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
      const commandOptions: {cwd: string} = {cwd: './test/data'};

      // Make script executable
      await execAsync('chmod +x ./get-block.sh', commandOptions);

      // Execute script
      const scriptStd: {stdout: string; stderr: string} = await execAsync('./get-block.sh 1', commandOptions);

      expect(scriptStd.stderr).to.equal('');
      expect(scriptStd.stdout).to.include('READ_BLOCK_SUCCESS');

      await pod.stopPortForward(srv);
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
        remoteConfig.configuration.components.getComponent<BlockNodeStateSchema>(
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
