// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {type ClusterReferenceName, type DeploymentName, type ExtendedNetServer} from '../../../../src/types/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {main} from '../../../../src/index.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {sleep} from '../../../../src/core/helpers.js';
import {type PackageDownloader} from '../../../../src/core/package-downloader.js';
import http from 'node:http';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';

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
      optionFromFlag(Flags.clusterRef),
      clusterReference,
    );
    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  private static async verifyRelayDeployWasSuccessful(
    contexts: string[],
    namespace: NamespaceName,
    testLogger: SoloLogger,
  ): Promise<void> {
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const k8: K8 = k8Factory.getK8(contexts[1]);
    const relayPods: Pod[] = await k8
      .pods()
      .list(namespace, [
        'app.kubernetes.io/instance=json-rpc-relay',
        'app.kubernetes.io/name=json-rpc-relay',
      ]);
    expect(relayPods).to.have.lengthOf(1);
  }

  public static deploy(options: BaseTestOptions): void {
    const {testName, deployment, namespace, contexts, clusterReferenceNameArray, testLogger} = options;
    const {soloRelayDeployArgv, verifyRelayDeployWasSuccessful} = RelayTest;

    it(`${testName}: JSON-RPC relay deploy`, async (): Promise<void> => {
      await main(soloRelayDeployArgv(testName, deployment, clusterReferenceNameArray[1]));
      await verifyRelayDeployWasSuccessful(contexts, namespace, testLogger);
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
