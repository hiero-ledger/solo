// SPDX-License-Identifier: Apache-2.0

import {before, describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  endToEndTestSuite,
  getTestCluster,
  HEDERA_PLATFORM_VERSION_TAG,
  hederaPlatformSupportsNonZeroRealms,
} from '../test-utility.js';
import {sleep} from '../../src/core/helpers.js';
import {type NodeAlias} from '../../src/types/aliases.js';
import {Duration} from '../../src/core/time/duration.js';
import {NamespaceName} from '../../src/types/namespace/namespace-name.js';
import {Argv} from '../helpers/argv-wrapper.js';
import {type Pod} from '../../src/integration/kube/resources/pod/pod.js';
import {ConsensusCommandDefinition} from '../../src/commands/command-definitions/consensus-command-definition.js';

export function endToEndNodeKeyRefreshTest(testName: string, mode: 'stop' | 'kill'): void {
  const releaseTag: string = HEDERA_PLATFORM_VERSION_TAG;
  const namespace: NamespaceName = NamespaceName.of(testName);
  const argv: Argv = Argv.getDefaultArgv(namespace);
  argv.setArg(flags.namespace, namespace.name);
  argv.setArg(flags.releaseTag, releaseTag);
  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
  argv.setArg(flags.generateGossipKeys, true);
  argv.setArg(flags.generateTlsKeys, true);
  argv.setArg(flags.clusterRef, getTestCluster());
  argv.setArg(flags.devMode, true);
  argv.setArg(flags.realm, hederaPlatformSupportsNonZeroRealms() ? 65_535 : 0);
  argv.setArg(flags.shard, hederaPlatformSupportsNonZeroRealms() ? 1023 : 0);

  endToEndTestSuite(testName, argv, {}, (bootstrapResp): void => {
    const {
      opts: {accountManager, k8Factory, remoteConfig, logger, commandInvoker},
      cmd: {nodeCmd},
    } = bootstrapResp;

    describe(`NodeCommand [testName ${testName}, mode ${mode}, release ${releaseTag}]`, async (): Promise<void> => {
      describe(`Node should have started successfully [mode ${mode}, release ${releaseTag}]`, (): void => {
        balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger);

        accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger);

        it(`Node Proxy should be UP [mode ${mode}, release ${releaseTag}`, async (): Promise<void> => {
          try {
            const labels: string[] = ['app=haproxy-node1', 'solo.hedera.com/type=haproxy'];
            const readyPods: Pod[] = await k8Factory.default().pods().waitForReadyStatus(namespace, labels, 300, 1000);
            expect(readyPods).to.not.be.null;
            expect(readyPods).to.not.be.undefined;
            expect(readyPods.length).to.be.greaterThan(0);
          } finally {
            await nodeCmd.close();
          }
        }).timeout(Duration.ofMinutes(2).toMillis());
      });

      describe(`Node should refresh successfully [mode ${mode}, release ${releaseTag}]`, (): void => {
        const nodeAlias: NodeAlias = 'node1';

        before(async function (): Promise<void> {
          this.timeout(Duration.ofMinutes(2).toMillis());

          if (mode === 'kill') {
            // await k8Factory.default().pods().readByReference(PodReference.of(namespace, podName)).killPod();
          } else if (mode === 'stop') {
            await commandInvoker.invoke({
              argv: argv,
              command: ConsensusCommandDefinition.COMMAND_NAME,
              subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
              action: ConsensusCommandDefinition.NODE_STOP,
              callback: async (argv): Promise<boolean> => nodeCmd.handlers.stop(argv),
            });

            await sleep(Duration.ofSeconds(20)); // give time for node to stop and update its logs
          } else {
            throw new Error(`invalid mode: ${mode}`);
          }
        });

        nodePodShouldBeRunning();

        nodeShouldNotBeActive();

        nodeRefreshShouldSucceed();

        balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger);

        accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger);
      });
    });
  });
}

function nodePodShouldBeRunning(): void {}

function nodeRefreshShouldSucceed(): void {}

function nodeShouldNotBeActive(): void {}
