// SPDX-License-Identifier: Apache-2.0

import {after, afterEach, describe} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {deployNetworkTest, endToEndTestSuite, getTestCluster, startNodesTest} from '../../test-utility.js';
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
import * as SemVer from 'semver';
import {type ArgvStruct} from '../../../src/types/aliases.js';
import {type BlockNodeStateSchema} from '../../../src/data/schema/model/remote/state/block-node-state-schema.js';
import {HEDERA_PLATFORM_VERSION, MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE} from '../../../version.js';
import {TEST_LOCAL_BLOCK_NODE_VERSION} from '../../../version-test.js';

// eslint-disable-next-line @typescript-eslint/typedef
const execAsync = promisify(exec);

const testName: string = 'block-node-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
const clusterReference: ClusterReference = getTestCluster();
argv.setArg(flags.namespace, namespace.name);
// TODO remove TEST_BLOCK_NODE_MINIMUM_PLATFORM_VERSION and the tertiary when we have a version that supports block node
argv.setArg(
  flags.releaseTag,
  SemVer.lt(
    new SemVer.SemVer(HEDERA_PLATFORM_VERSION),
    new SemVer.SemVer(MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE),
  )
    ? MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE
    : HEDERA_PLATFORM_VERSION,
);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, clusterReference);
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);

// Notes: need to check out block node repo and build the block node image first.
// Then use the following command to load image into the kind cluster after cluster creation
// kind load docker-image block-node-server:<tag> --name <cluster-name>
argv.setArg(flags.blockLocalTag, TEST_LOCAL_BLOCK_NODE_VERSION);

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
      blockNodeCommand = container.resolve<BlockNodeCommand>(InjectTokens.BlockNodeCommand);
      platformVersion = new SemVer.SemVer(argv.getArg<string>(flags.releaseTag));
      if (SemVer.lt(platformVersion, new SemVer.SemVer(MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE))) {
        expect.fail(
          `BlockNodeCommand should not be tested with versions less than ${MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE}`,
        );
      }
    });

    after(async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(5).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    afterEach(async (): Promise<void> => await sleep(Duration.ofMillis(5)));

    it(`Should fail with versions less than ${MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE}`, async (): Promise<void> => {
      const argvClone: Argv = argv.clone();
      argvClone.setArg(flags.releaseTag, 'v0.61.0');

      try {
        await commandInvoker.invoke({
          argv: argvClone,
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

    it("Should succeed deploying block node with 'add' command", async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(5).toMillis());

      await commandInvoker.invoke({
        argv: argv,
        command: BlockNodeCommand.COMMAND_NAME,
        subcommand: 'node add',
        // @ts-expect-error to access private property
        callback: async (argv: {_: string[]} & Record<string, any>): Promise<boolean> => blockNodeCommand.add(argv),
      });

      remoteConfig.configuration.components.getComponent<BlockNodeStateSchema>(ComponentTypes.BlockNode, 0);
    });

    deployNetworkTest(argv, commandInvoker, networkCmd);

    startNodesTest(argv, commandInvoker, nodeCmd);

    it('Should be able to use the getSingleBlock Method to validate block node connectivity', async (): Promise<void> => {
      const pod: Pod = await k8Factory
        .default()
        .pods()
        .list(namespace, [`app.kubernetes.io/instance=${constants.BLOCK_NODE_RELEASE_NAME}-0`])
        .then((pods: Pod[]): Pod => pods[0]);

      const srv: ExtendedNetServer = await pod.portForward(8080, 8080);
      const commandOptions: {cwd: string} = {cwd: './test/data'};

      // Make script executable
      await execAsync('chmod +x ./get-block.sh', commandOptions);

      // Execute script
      const scriptStd: {stdout: string; stderr: string} = await execAsync('./get-block.sh 1', commandOptions);

      expect(scriptStd.stderr).to.equal('');
      expect(scriptStd.stdout).to.include('"status": "SUCCESS"');

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
