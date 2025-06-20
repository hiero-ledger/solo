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

export class DeploymentTest extends BaseCommandTest {
  private static soloDeploymentCreateArgv(
    testName: string,
    deployment: DeploymentName,
    namespace: NamespaceName,
  ): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = DeploymentTest;

    const argv: string[] = newArgv();
    argv.push(
      'deployment',
      'create',
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.namespace),
      namespace.name,
    );
    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  public static create(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, namespace} = options;
    const {soloDeploymentCreateArgv} = DeploymentTest;

    it(`${testName}: solo deployment create`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment create`);
      await main(soloDeploymentCreateArgv(testName, deployment, namespace));
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
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = DeploymentTest;

    const argv: string[] = newArgv();
    argv.push(
      'deployment',
      'add-cluster',
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
