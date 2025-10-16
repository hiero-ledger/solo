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
import {type Context, type DeploymentName} from '../../../../src/types/index.js';
import {Flags as flags, Flags} from '../../../../src/commands/flags.js';
import {type BaseTestOptions} from './base-test-options.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {it} from 'mocha';
import {sleep} from '../../../../src/core/helpers.js';
import * as constants from '../../../../src/core/constants.js';
import {type ChartManager} from '../../../../src/core/chart-manager.js';

export class NetworkTest extends BaseCommandTest {
  private static soloNetworkDeployArgv(
    testName: string,
    deployment: DeploymentName,
    enableLocalBuildPathTesting: boolean,
    localBuildReleaseTag: string,
    loadBalancerEnabled: boolean,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NetworkTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_DEPLOY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.persistentVolumeClaims),
    );

    // have to enable load balancer to resolve cross cluster in multi-cluster
    if (loadBalancerEnabled) {
      argv.push(optionFromFlag(Flags.loadBalancerEnabled));
    }

    if (enableLocalBuildPathTesting) {
      argv.push(optionFromFlag(Flags.releaseTag), localBuildReleaseTag);
    }
    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
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

    it(`${testName}: consensus network deploy`, async (): Promise<void> => {
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
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NetworkTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.deletePvcs),
      optionFromFlag(Flags.deleteSecrets),
      optionFromFlag(Flags.serviceMonitor),
      optionFromFlag(Flags.podLog),
      optionFromFlag(Flags.force),
      optionFromFlag(Flags.quiet),
    );
    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName, deployment} = options;
    const {soloNetworkDestroyArgv} = NetworkTest;

    it(`${testName}: consensus network destroy`, async (): Promise<void> => {
      await main(soloNetworkDestroyArgv(testName, deployment));
    });

    it(`${testName}: consensus network destroy should success`, async (): Promise<void> => {
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      const chartManager: ChartManager = container.resolve<ChartManager>(InjectTokens.ChartManager);
      const {namespace, contexts: contextRecord} = options;

      // convert iterator into array
      const contexts: string[] = [...contextRecord.values()];

      async function getPodsCountInMultipleNamespaces(label: string[]): Promise<number> {
        return await Promise.all(
          contexts.map((context: Context): Promise<Pod[]> => k8Factory.getK8(context).pods().list(namespace, label)),
        ).then((results): number => results.flat().length);
      }

      async function waitUntilPodsGone(label: string[]): Promise<void> {
        while (true) {
          const podsCount: number = await getPodsCountInMultipleNamespaces(label);
          if (podsCount === 0) {
            return;
          }

          await sleep(Duration.ofSeconds(3));
        }
      }

      await waitUntilPodsGone(['solo.hedera.com/type=network-node']);
      await waitUntilPodsGone(['app=minio']);

      const isChartInstalled: boolean = await chartManager.isChartInstalled(namespace, constants.SOLO_DEPLOYMENT_CHART);

      expect(isChartInstalled).to.be.false;

      // check if pvc are deleted
      await expect(k8Factory.getK8(contexts[0]).pvcs().list(namespace, [])).eventually.to.have.lengthOf(0);
      await expect(k8Factory.getK8(contexts[1]).pvcs().list(namespace, [])).eventually.to.have.lengthOf(0);

      // check if secrets are deleted
      await expect(k8Factory.getK8(contexts[0]).secrets().list(namespace)).eventually.to.have.lengthOf(0);
      await expect(k8Factory.getK8(contexts[1]).secrets().list(namespace)).eventually.to.have.lengthOf(0);
    }).timeout(Duration.ofMinutes(2).toMillis());
  }
}
