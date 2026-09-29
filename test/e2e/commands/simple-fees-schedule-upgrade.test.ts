// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';
import {expect} from 'chai';

import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Duration} from '../../../src/core/time/duration.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {ClusterReferenceTest} from './tests/cluster-reference-test.js';
import {DeploymentTest} from './tests/deployment-test.js';
import {ConsensusNodeTest} from './tests/consensus-node-test.js';
import {NetworkTest} from './tests/network-test.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import * as constants from '../../../src/core/constants.js';

import {type BaseTestOptions} from './tests/base-test-options.js';
import fs from 'node:fs';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {resetForTest} from '../../test-container.js';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {HelmMetricsServer} from '../../helpers/helm-metrics-server.js';
import {HelmMetalLoadBalancer} from '../../helpers/helm-metal-load-balancer.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type Container} from '../../../src/integration/kube/resources/container/container.js';
import {ContainerReference} from '../../../src/integration/kube/resources/container/container-reference.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import {main} from '../../../src/index.js';
import {Flags} from '../../../src/commands/flags.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';
import {sleep} from '../../../src/core/helpers.js';
import {type AccountManager} from '../../../src/core/account-manager.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeState} from '../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {
  Status,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';

const testName: string = 'simple-fees-schedule-upgrade-test';

// v0.72.x creates file 0.0.113 at genesis from a simpleFeesSchedules.json that lacks the
// CONSENSUS_SUBMIT_MESSAGE_WITHOUT_CUSTOM_FEE_BYTES entry, which later releases require for every topic message.
const INITIAL_VERSION: string = 'v0.72.1';

// Pinned rather than taken from version-test.ts: the fixture files below must match this exact release.
const TARGET_VERSION: string = 'v0.76.4';
const SYSTEM_FILES_DIRECTORY: string = PathEx.join('test', 'data', 'post-upgrade-system-files', TARGET_VERSION);

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Simple Fees Schedule Upgrade Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withConsensusNodesCount(2)
  .withLoadBalancerEnabled(false)
  .withPinger(false)
  .withRealm(0)
  .withShard(0)
  .withServiceMonitor(true)
  .withPodLog(true)
  .withTestSuiteCallback(
    (options: BaseTestOptions, preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>): void => {
      describe('Simple Fees Schedule Upgrade E2E Test', (): void => {
        const {testCacheDirectory, testLogger, namespace, contexts, deployment} = options;

        before(async (): Promise<void> => {
          fs.rmSync(testCacheDirectory, {recursive: true, force: true});
          try {
            fs.rmSync(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {
              force: true,
            });
          } catch {
            // allowed to fail if the file doesn't exist
          }
          resetForTest(namespace.name, testCacheDirectory, false);
          for (const item of contexts) {
            await container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item).namespaces().delete(namespace);
          }
          await HelmMetricsServer.installMetricsServer(testName);
          await HelmMetalLoadBalancer.installMetalLoadBalancer(testName);
          testLogger.info(`${testName}: starting ${testName} e2e test`);
        }).timeout(Duration.ofMinutes(5).toMillis());

        after(async (): Promise<void> => {
          await preDestroy(endToEndTestSuite);
        }).timeout(Duration.ofMinutes(5).toMillis());

        beforeEach(async (): Promise<void> => {
          testLogger.info(`${testName}: resetting containers for each test`);
          resetForTest(namespace.name, testCacheDirectory, false);
          testLogger.info(`${testName}: finished resetting containers for each test`);
        });

        ClusterReferenceTest.connect(options);
        DeploymentTest.create(options);
        DeploymentTest.addCluster(options);
        ConsensusNodeTest.keys(options);

        NetworkTest.deploy(options, INITIAL_VERSION);
        ConsensusNodeTest.setup(options, INITIAL_VERSION);
        ConsensusNodeTest.start(options);

        it(`${testName}: upgrade with post-upgrade system files`, async (): Promise<void> => {
          const argv: string[] = ConsensusNodeTest.newArgv();
          argv.push(
            ConsensusCommandDefinition.COMMAND_NAME,
            ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.NETWORK_UPGRADE,
            ConsensusNodeTest.optionFromFlag(Flags.deployment),
            deployment,
            ConsensusNodeTest.optionFromFlag(Flags.force),
            ConsensusNodeTest.optionFromFlag(Flags.upgradeVersion),
            TARGET_VERSION,
            ConsensusNodeTest.optionFromFlag(Flags.simpleFeesSchedulesFile),
            PathEx.join(SYSTEM_FILES_DIRECTORY, constants.SIMPLE_FEES_SCHEDULES_JSON),
            ConsensusNodeTest.optionFromFlag(Flags.throttlesFile),
            PathEx.join(SYSTEM_FILES_DIRECTORY, constants.THROTTLES_JSON),
          );
          ConsensusNodeTest.argvPushGlobalFlags(argv, testName, true, true);
          await main(argv);
        }).timeout(Duration.ofMinutes(15).toMillis());

        it(`${testName}: every node applied the post-upgrade system files`, async (): Promise<void> => {
          const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
          const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);

          for (const pod of pods) {
            const containerReference: Container = k8Factory
              .default()
              .containers()
              .readByRef(ContainerReference.of(PodReference.of(namespace, pod.podReference.name), ROOT_CONTAINER));

            // the node runs its post-upgrade setup on the first transaction it handles after the restart
            let postUpgradeLog: string = '';
            for (
              let attempt: number = 0;
              attempt < 24 && !postUpgradeLog.includes('Doing post-upgrade setup');
              attempt++
            ) {
              await sleep(Duration.ofSeconds(5));
              postUpgradeLog = await containerReference.execContainer([
                'bash',
                '-c',
                "grep -h -e 'Doing post-upgrade setup' -e 'Dispatching synthetic update' -e 'Failed to parse update file' " +
                  `${HEDERA_HAPI_PATH}/output/hgcaa*.log || true`,
              ]);
            }

            for (const fileName of [constants.SIMPLE_FEES_SCHEDULES_JSON, constants.THROTTLES_JSON]) {
              expect(postUpgradeLog).to.include(
                `Dispatching synthetic update based on contents of ${HEDERA_HAPI_PATH}/data/config/${fileName}`,
              );
            }
            expect(postUpgradeLog).to.not.include('Failed to parse update file');
          }
        }).timeout(Duration.ofMinutes(5).toMillis());

        it(`${testName}: submitting a topic message succeeds after the upgrade`, async (): Promise<void> => {
          const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
            InjectTokens.LocalConfigRuntimeState,
          );
          await localConfig.load();

          const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
            InjectTokens.RemoteConfigRuntimeState,
          );
          await remoteConfig.load(namespace, contexts[0]);

          const accountManager: AccountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);
          await accountManager.loadNodeClient(namespace, remoteConfig.getClusterRefs(), deployment, false);

          const topicCreateResponse: TransactionResponse = await new TopicCreateTransaction().execute(
            accountManager._nodeClient,
          );
          const topicReceipt: TransactionReceipt = await topicCreateResponse.getReceipt(accountManager._nodeClient);

          // with the stale 0.0.113 from genesis this precheck fails with FAIL_INVALID
          const submitResponse: TransactionResponse = await new TopicMessageSubmitTransaction({
            topicId: topicReceipt.topicId,
            message: 'simple fees schedule upgrade',
          }).execute(accountManager._nodeClient);
          const submitReceipt: TransactionReceipt = await submitResponse.getReceipt(accountManager._nodeClient);

          expect(submitReceipt.status).to.deep.equal(Status.Success);
        }).timeout(Duration.ofMinutes(2).toMillis());

        describe('Write log metrics', async (): Promise<void> => {
          it('Should write log metrics', async (): Promise<void> => {
            await new MetricsServerImpl().logMetrics(
              testName,
              PathEx.join(constants.SOLO_LOGS_DIR, `${testName}`),
              undefined,
              undefined,
              contexts,
            );
          });
        });
      }).timeout(Duration.ofMinutes(30).toMillis());
    },
  )
  .build();

endToEndTestSuite.runTestSuite();
