// SPDX-License-Identifier: Apache-2.0

import {main} from '../../../../src/index.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';
import {Templates} from '../../../../src/core/templates.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {expect} from 'chai';
import {type DeploymentName} from '../../../../src/types/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {type BaseTestOptions} from './base-test-options.js';
import {TestArgumentsBuilder} from '../../../helpers/test-arguments-builder.js';

export class NetworkTest {
  private static soloNetworkDeployArgv(
    testName: string,
    deployment: DeploymentName,
    enableLocalBuildPathTesting: boolean,
    localBuildReleaseTag: string,
    loadBalancerEnabled: boolean,
  ): string[] {
    const testArgumentsBuilder: TestArgumentsBuilder = TestArgumentsBuilder.initialize('network deploy', testName)
      .setArg(Flags.deployment, deployment)
      .setTestCacheDirectory()
      .setChartDirectory();

    if (loadBalancerEnabled) {
      testArgumentsBuilder.setArg(Flags.loadBalancerEnabled);
    }

    if (enableLocalBuildPathTesting) {
      testArgumentsBuilder.setArg(Flags.releaseTag, localBuildReleaseTag);
    }

    return testArgumentsBuilder.build();
  }

  public static deploy(options: BaseTestOptions): void {
    const {
      testName,
      deployment,
      namespace,
      contexts,
      enableLocalBuildPathTesting,
      localBuildReleaseTag,
      loadBalancerEnabled,
    } = options;
    const {soloNetworkDeployArgv} = NetworkTest;

    it(`${testName}: network deploy`, async (): Promise<void> => {
      await main(
        soloNetworkDeployArgv(
          testName,
          deployment,
          enableLocalBuildPathTesting,
          localBuildReleaseTag,
          loadBalancerEnabled,
        ),
      );
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      for (const [index, context_] of contexts.entries()) {
        const k8: K8 = k8Factory.getK8(context_);
        expect(await k8.namespaces().has(namespace), `namespace ${namespace} should exist in ${context}`).to.be.true;
        const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);
        expect(pods).to.have.lengthOf(1);
        const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(index + 1);
        expect(pods[0].labels['solo.hedera.com/node-name']).to.equal(nodeAlias);
      }
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  private static soloNetworkDestroyArgv(testName: string, deployment: DeploymentName): string[] {
    return TestArgumentsBuilder.initialize('network destroy', testName)
      .setArg(Flags.deployment, deployment)
      .setChartDirectory()
      .build();
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName, deployment} = options;
    const {soloNetworkDestroyArgv} = NetworkTest;

    it(`${testName}: network destroy`, async (): Promise<void> => {
      await main(soloNetworkDestroyArgv(testName, deployment));
    });
  }
}
