// SPDX-License-Identifier: Apache-2.0

import {main} from '../../../../src/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {BaseCommandTest} from './base-command-test.js';
import {BlockCommandDefinition} from '../../../../src/commands/command-definitions/block-command-definition.js';
import {type BaseTestOptions} from './base-test-options.js';
import {type ComponentId, type DeploymentName} from '../../../../src/types/index.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {Templates} from '../../../../src/core/templates.js';
import * as constants from '../../../../src/core/constants.js';
import {expect} from 'chai';
import {exec, type ExecException, type ExecOptions} from 'node:child_process';
import {promisify} from 'node:util';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {type NodeAlias, type NodeAliases} from '../../../../src/types/aliases.js';
import {HEDERA_HAPI_PATH} from '../../../../src/core/constants.js';
import {type Container} from '../../../../src/integration/kube/resources/container/container.js';

export class BlockNodeTest extends BaseCommandTest {
  private static soloBlockNodeDeployArgv(
    testName: string,
    deployment: DeploymentName,
    enableLocalBuildPathTesting: boolean,
    localBuildReleaseTag: string,
    nodeAliases?: NodeAliases,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = BlockNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      BlockCommandDefinition.COMMAND_NAME,
      BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
      BlockCommandDefinition.NODE_ADD,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    if (enableLocalBuildPathTesting) {
      argv.push(optionFromFlag(Flags.releaseTag), localBuildReleaseTag);
    }

    if (nodeAliases !== undefined && nodeAliases.length > 0) {
      argv.push(optionFromFlag(Flags.nodeAliasesUnparsed), nodeAliases.join(','));
    }

    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  private static soloBlockNodeDestroyArgv(testName: string, deployment: DeploymentName): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = BlockNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      BlockCommandDefinition.COMMAND_NAME,
      BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
      BlockCommandDefinition.NODE_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.force),
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.devMode),
    );

    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  public static add(options: BaseTestOptions, nodeAliases?: NodeAliases): void {
    const {testName, deployment, localBuildReleaseTag, enableLocalBuildPathTesting} = options;
    const {soloBlockNodeDeployArgv} = BlockNodeTest;

    it(`${testName}: block node add`, async (): Promise<void> => {
      await main(
        soloBlockNodeDeployArgv(testName, deployment, enableLocalBuildPathTesting, localBuildReleaseTag, nodeAliases),
      );
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName, deployment} = options;
    const {soloBlockNodeDestroyArgv} = BlockNodeTest;

    it(`${testName}: block node destroy`, async (): Promise<void> => {
      await main(soloBlockNodeDestroyArgv(testName, deployment));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static testBlockNode(options: BaseTestOptions, blockNodeId: number = 1): void {
    const {namespace, contexts, testName} = options;

    const execAsync: (
      command: string,
      options?: ExecOptions,
    ) => Promise<{stdout: string; stderr: string; error?: ExecException}> = promisify(exec);

    it(`${testName}: test block node connection for block node ${blockNodeId}`, async (): Promise<void> => {
      const pod: Pod = await container
        .resolve<K8Factory>(InjectTokens.K8Factory)
        .getK8(contexts[0])
        .pods()
        .list(namespace, Templates.renderBlockNodeLabels(blockNodeId))
        .then((pods: Pod[]): Pod => pods[0]);

      const srv: number = await pod.portForward(constants.BLOCK_NODE_PORT, constants.BLOCK_NODE_PORT);
      const commandOptions: ExecOptions = {cwd: './test/data', maxBuffer: 50 * 1024 * 1024, encoding: 'utf8'};

      // Make script executable
      await execAsync('chmod +x ./get-block.sh', commandOptions);

      // Execute script
      const scriptStd: {stdout: string; stderr: string} = await execAsync('./get-block.sh 1', commandOptions);

      expect(scriptStd.stderr).to.equal('');
      expect(scriptStd.stdout).to.include('"status": "SUCCESS"');

      await pod.stopPortForward(srv);
    });
  }

  public static verifyBlockNodesJson(
    options: BaseTestOptions,
    nodeAlias: NodeAlias,
    blockNodeIds: ComponentId[],
    excludedBlockNodeIds: ComponentId[] = [],
  ): void {
    const {namespace, contexts, testName} = options;

    it(`${testName}: verify block-nodes.json for ${nodeAlias}`, async (): Promise<void> => {
      const root: Container = await container
        .resolve<K8Factory>(InjectTokens.K8Factory)
        .getK8(contexts[0])
        .helpers()
        .getConsensusNodeRootContainer(namespace, nodeAlias);

      const output: string = await root.execContainer([
        'bash',
        '-c',
        `cat ${HEDERA_HAPI_PATH}/data/config/block-nodes.json`,
      ]);

      for (const blockNodeId of blockNodeIds) {
        expect(output).to.include(`block-node-${blockNodeId}`);
      }

      for (const excludedBlockNodeId of excludedBlockNodeIds) {
        expect(output).to.not.include(`block-node-${excludedBlockNodeId}`);
      }
    });
  }
}
