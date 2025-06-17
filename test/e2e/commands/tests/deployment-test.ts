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

export class DeploymentTest extends BaseCommandTest {
  private soloDeploymentCreateArgv(deployment: DeploymentName, namespace: NamespaceName): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = this;

    const argv: string[] = newArgv();
    argv.push(
      'deployment',
      'create',
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.namespace),
      namespace.name,
    );
    argvPushGlobalFlags(argv);
    return argv;
  }

  public create(): void {
    const {testName, testLogger, deployment, namespace} = this.options;

    it(`${testName}: solo deployment create`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment create`);
      await main(this.soloDeploymentCreateArgv(deployment, namespace));
      testLogger.info(`${testName}: finished solo deployment create`);
    });
  }

  private soloDeploymentAddClusterArgv(
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    numberOfNodes: number,
  ): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = this;

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
    argvPushGlobalFlags(argv);
    return argv;
  }

  public addCluster(): void {
    const {testName, testLogger, deployment, clusterReferenceNameArray} = this.options;
    const {soloDeploymentAddClusterArgv} = this;
    const soloDeploymentAddClusterArgvBound: (
      deployment: DeploymentName,
      clusterReference: ClusterReferenceName,
      numberOfNodes: number,
    ) => string[] = soloDeploymentAddClusterArgv.bind(this, deployment);

    it(`${testName}: solo deployment add-cluster`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo deployment add-cluster`);
      for (const element of clusterReferenceNameArray) {
        await main(soloDeploymentAddClusterArgvBound(deployment, element, 1));
      }
      const remoteConfig: RemoteConfigRuntimeStateApi = container.resolve(InjectTokens.RemoteConfigRuntimeState);
      expect(remoteConfig.isLoaded(), 'remote config manager should be loaded').to.be.true;
      const consensusNodes: Record<ComponentId, ConsensusNodeStateSchema> =
        remoteConfig.configuration.components.state.consensusNodes;
      expect(Object.entries(consensusNodes).length, 'consensus node count should be 2').to.equal(2);
      expect(consensusNodes[0].metadata.cluster).to.equal(clusterReferenceNameArray[0]);
      expect(consensusNodes[1].metadata.cluster).to.equal(clusterReferenceNameArray[1]);
      testLogger.info(`${testName}: finished solo deployment add-cluster`);
    });
  }
}
