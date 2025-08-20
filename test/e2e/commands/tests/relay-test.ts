// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {type ClusterReferenceName, type DeploymentName} from '../../../../src/types/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {main} from '../../../../src/index.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';
import {RelayCommandDefinition} from '../../../../src/commands/command-definitions/relay-command-definition.js';

export class RelayTest extends BaseCommandTest {
  private static soloRelayDeployArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = RelayTest;

    const argv: string[] = newArgv();
    argv.push(
      RelayCommandDefinition.COMMAND_NAME,
      RelayCommandDefinition.NODE_SUBCOMMAND_NAME,
      RelayCommandDefinition.NODE_ADD,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      'node2',
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  private static async verifyRelayDeployWasSuccessful(contexts: string[], namespace: NamespaceName): Promise<void> {
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const k8: K8 = k8Factory.getK8(contexts[1]);
    const relayPods: Pod[] = await k8.pods().list(namespace, ['app.kubernetes.io/name=relay']);
    expect(relayPods).to.have.lengthOf(1);
  }

  public static deploy(options: BaseTestOptions): void {
    const {testName, deployment, namespace, contexts, clusterReferenceNameArray, testLogger} = options;
    const {soloRelayDeployArgv, verifyRelayDeployWasSuccessful} = RelayTest;

    it(`${testName}: JSON-RPC relay node add`, async (): Promise<void> => {
      await main(soloRelayDeployArgv(testName, deployment, clusterReferenceNameArray[1]));
      await verifyRelayDeployWasSuccessful(contexts, namespace);
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
