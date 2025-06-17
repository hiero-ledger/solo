// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
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

export class NetworkTest extends BaseCommandTest {
  private soloNetworkDeployArgv(
    deployment: DeploymentName,
    enableLocalBuildPathTesting: boolean,
    localBuildReleaseTag: string,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = this;

    const argv: string[] = newArgv();
    argv.push(
      'network',
      'deploy',
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.loadBalancerEnabled),
    ); // have to enable load balancer to resolve cross cluster in multi-cluster
    if (enableLocalBuildPathTesting) {
      argv.push(optionFromFlag(Flags.releaseTag), localBuildReleaseTag);
    }
    argvPushGlobalFlags(argv, true, true);
    return argv;
  }

  public deploy(): void {
    const {testName, deployment, namespace, contexts, enableLocalBuildPathTesting, localBuildReleaseTag} = this.options;
    const {soloNetworkDeployArgv} = this;
    const soloNetworkDeployArgvBound: (
      deployment: DeploymentName,
      enableLocalBuildPathTesting: boolean,
      localBuildReleaseTag: string,
    ) => string[] = soloNetworkDeployArgv.bind(this, deployment, enableLocalBuildPathTesting, localBuildReleaseTag);

    it(`${testName}: network deploy`, async (): Promise<void> => {
      await main(soloNetworkDeployArgvBound(deployment, enableLocalBuildPathTesting, localBuildReleaseTag));
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

  private soloNetworkDestroyArgv(deployment: DeploymentName): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = this;

    const argv: string[] = newArgv();
    argv.push('network', 'destroy', optionFromFlag(Flags.deployment), deployment);
    argvPushGlobalFlags(argv, false, true);
    return argv;
  }

  public destroy(): void {
    const {testName, deployment} = this.options;
    const {soloNetworkDestroyArgv} = this;
    const soloNetworkDestroyArgvBound: (deployment: DeploymentName) => string[] = soloNetworkDestroyArgv.bind(
      this,
      deployment,
    );

    it(`${testName}: network destroy`, async (): Promise<void> => {
      await main(soloNetworkDestroyArgvBound(deployment));
    });
  }
}
