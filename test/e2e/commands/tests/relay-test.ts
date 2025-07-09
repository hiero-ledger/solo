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
import {MirrorNodeTest} from './mirror-node-test.js';

export class RelayTest extends BaseCommandTest {
  private static soloRelayDeployArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = RelayTest;

    const argv: string[] = newArgv();
    argv.push(
      'relay',
      'deploy',
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      'node2',
    );
    argvPushGlobalFlags(argv, testName, false, false);
    return argv;
  }

  private static async verifyRelayDeployWasSuccessful(contexts: string[], namespace: NamespaceName): Promise<void> {
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const k8: K8 = k8Factory.getK8(contexts[1]);
    const relayPods: Pod[] = await k8
      .pods()
      .list(namespace, ['app=hedera-json-rpc-relay', 'app.kubernetes.io/name=hedera-json-rpc-relay']);
    expect(relayPods).to.have.lengthOf(1);

    // enable port forward 7546 to 7546
    const relayPod: Pod = relayPods[0];
    await k8.pods().readByReference(relayPod.podReference).portForward(7546, 7546);
  }

  public static deploy(options: BaseTestOptions): void {
    const {testName, deployment, namespace, contexts, clusterReferenceNameArray} = options;
    const {soloRelayDeployArgv, verifyRelayDeployWasSuccessful} = RelayTest;

    it(`${testName}: JSON-RPC relay deploy`, async (): Promise<void> => {
      // switch back to the target cluster context
      MirrorNodeTest.executeCommand(
        `kubectl config use-context "${contexts[1]}"`,
        'Switching back to first cluster context',
      );

      await main(soloRelayDeployArgv(testName, deployment, clusterReferenceNameArray[1]));
      await verifyRelayDeployWasSuccessful(contexts, namespace);

      MirrorNodeTest.executeBackgroundCommand(
        `kubectl port-forward -n "${namespace.name}" svc/relay-node2-hedera-json-rpc-relay 7546:7546`,
        'Relay Port Forward',
      );
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
