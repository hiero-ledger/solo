// SPDX-License-Identifier: Apache-2.0

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
import {TestArgumentsBuilder} from '../../../helpers/test-arguments-builder.js';
import {DeploymentCommand} from '../../../../src/commands/deployment.js';

export class DeploymentTest {
  private static soloDeploymentCreateArgv(
    testName: string,
    deployment: DeploymentName,
    namespace: NamespaceName,
    realm: number,
    shard: number,
  ): string[] {
    return TestArgumentsBuilder.initialize('deployment create', testName)
      .setCommandFlags(DeploymentCommand.CREATE_FLAGS_LIST)
      .setArg(Flags.deployment, deployment)
      .setArg(Flags.namespace, namespace.name)
      .setArg(Flags.realm, realm)
      .setArg(Flags.shard, shard)
      .build();
  }

  public static create(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, namespace, realm, shard} = options;
    const {soloDeploymentCreateArgv} = DeploymentTest;

    it(`${testName}: solo deployment create`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment create`);
      await main(soloDeploymentCreateArgv(testName, deployment, namespace, realm, shard));
      // TODO check that the deployment was created
      testLogger.info(`${testName}: finished solo deployment create`);
    });
  }

  private static soloDeploymentAddClusterArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    numberOfNodes: number,
  ): string[] {
    return TestArgumentsBuilder.initialize('deployment add-cluster', testName)
      .setCommandFlags(DeploymentCommand.ADD_CLUSTER_FLAGS_LIST)
      .setArg(Flags.deployment, deployment)
      .setArg(Flags.clusterRef, clusterReference)
      .setArg(Flags.numberOfConsensusNodes, numberOfNodes)
      .build();
  }

  public static addCluster(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, clusterReferenceNameArray, consensusNodesCount} = options;
    const {soloDeploymentAddClusterArgv} = DeploymentTest;

    it(`${testName}: solo deployment add-cluster`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment add-cluster`);
      for (const element of clusterReferenceNameArray) {
        await main(soloDeploymentAddClusterArgv(testName, deployment, element, 1));
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
      testLogger.info(`${testName}: finished solo deployment add-cluster`);
    });
  }
}
