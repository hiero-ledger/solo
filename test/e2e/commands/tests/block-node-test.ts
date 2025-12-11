// SPDX-License-Identifier: Apache-2.0

import {main} from '../../../../src/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {BaseCommandTest} from './base-command-test.js';
import {BlockCommandDefinition} from '../../../../src/commands/command-definitions/block-command-definition.js';
import {type BaseTestOptions} from './base-test-options.js';
import {type ClusterReferenceName, type DeploymentName} from '../../../../src/types/index.js';

export class BlockNodeTest extends BaseCommandTest {
  private static soloBlockNodeDeployArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    enableLocalBuildPathTesting: boolean,
    localBuildReleaseTag: string,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = BlockNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      BlockCommandDefinition.COMMAND_NAME,
      BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
      BlockCommandDefinition.NODE_ADD,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
    );

    if (enableLocalBuildPathTesting) {
      argv.push(optionFromFlag(Flags.releaseTag), localBuildReleaseTag);
    }

    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  private static soloBlockNodeDestroyArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = BlockNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      BlockCommandDefinition.COMMAND_NAME,
      BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
      BlockCommandDefinition.NODE_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.force),
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.devMode),
    );

    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  public static add(options: BaseTestOptions): void {
    const {testName, deployment, clusterReferenceNameArray, localBuildReleaseTag, enableLocalBuildPathTesting} =
      options;
    const {soloBlockNodeDeployArgv} = BlockNodeTest;

    it(`${testName}: block node add`, async (): Promise<void> => {
      await main(
        soloBlockNodeDeployArgv(
          testName,
          deployment,
          clusterReferenceNameArray[0],
          enableLocalBuildPathTesting,
          localBuildReleaseTag,
        ),
      );
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName, deployment, clusterReferenceNameArray} = options;
    const {soloBlockNodeDestroyArgv} = BlockNodeTest;

    it(`${testName}: block node destroy`, async (): Promise<void> => {
      await main(soloBlockNodeDestroyArgv(testName, deployment, clusterReferenceNameArray[1]));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
