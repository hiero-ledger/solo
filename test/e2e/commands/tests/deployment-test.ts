// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';
import {type ClusterReferenceName, type ComponentId, type DeploymentName} from '../../../../src/types/index.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {Flags} from '../../../../src/commands/flags.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type ConsensusNodeStateSchema} from '../../../../src/data/schema/model/remote/state/consensus-node-state-schema.js';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';
import {DeploymentCommandDefinition} from '../../../../src/commands/command-definitions/deployment-command-definition.js';

export class DeploymentTest extends BaseCommandTest {
  private static soloDeploymentCreateArgv(
    testName: string,
    deployment: DeploymentName,
    namespace: NamespaceName,
    realm: number,
    shard: number,
  ): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = DeploymentTest;

    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.CONFIG_CREATE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.namespace),
      namespace.name,
      optionFromFlag(Flags.realm),
      String(realm),
      optionFromFlag(Flags.shard),
      String(shard),
    );
    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  public static create(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, namespace, realm, shard} = options;
    const {soloDeploymentCreateArgv} = DeploymentTest;

    it(`${testName}: solo deployment config create`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment config create`);
      await main(soloDeploymentCreateArgv(testName, deployment, namespace, realm, shard));
      // TODO check that the deployment was created
      testLogger.info(`${testName}: finished solo deployment config create`);
    });
  }

  private static soloDeploymentAddClusterArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    numberOfNodes: number,
  ): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = DeploymentTest;

    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.CLUSTER_ATTACH,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.numberOfConsensusNodes),
      numberOfNodes.toString(),
    );
    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  public static addCluster(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, clusterReferenceNameArray, consensusNodesCount} = options;
    const {soloDeploymentAddClusterArgv} = DeploymentTest;

    it(`${testName}: solo deployment cluster attach`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment cluster attach`);

      // Compute distribution
      const clusterCount: number = clusterReferenceNameArray.length;
      const base: number = Math.floor(consensusNodesCount / clusterCount);
      const remainder: number = consensusNodesCount % clusterCount;

      const nodeCountsPerCluster: number[] = clusterReferenceNameArray.map((_, index): number =>
        index < remainder ? base + 1 : base,
      );

      // Now attach clusters with correct node count
      for (const [index, element] of clusterReferenceNameArray.entries()) {
        const nodeCount: number = nodeCountsPerCluster[index];
        await main(soloDeploymentAddClusterArgv(testName, deployment, element, nodeCount));
      }

      const remoteConfig: RemoteConfigRuntimeStateApi = container.resolve(InjectTokens.RemoteConfigRuntimeState);
      expect(remoteConfig.isLoaded(), 'remote config manager should be loaded').to.be.true;
      const consensusNodes: Record<ComponentId, ConsensusNodeStateSchema> =
        remoteConfig.configuration.components.state.consensusNodes;

      expect(Object.entries(consensusNodes).length, `consensus node count should be ${consensusNodesCount}`).to.equal(
        consensusNodesCount,
      );
      for (const [index, element] of clusterReferenceNameArray.entries()) {
        expect(consensusNodes[index].metadata.cluster).to.equal(element);
      }
      testLogger.info(`${testName}: finished solo deployment cluster attach`);
    });
  }
}
