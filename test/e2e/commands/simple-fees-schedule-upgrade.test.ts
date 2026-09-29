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

const testName: string = 'simple-fees-schedule-upgrade-test';

// Consensus node release predating the introduction of the CONSENSUS_SUBMIT_MESSAGE_WITHOUT_CUSTOM_FEE_BYTES
// extra-fee entry in the bundled genesis simpleFeesSchedules.json (added in the 0.73 line). A node bootstrapped
// at this version creates its file 0.0.113 genesis copy without that entry.
const PRE_SIMPLE_FEES_ENTRY_VERSION: string = 'v0.71.3';

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
        const {testCacheDirectory, testLogger, namespace, contexts} = options;

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

        // Bootstrap the network before the extra-fee entry existed, so file 0.0.113 is created at genesis
        // without it.
        NetworkTest.deploy(options, PRE_SIMPLE_FEES_ENTRY_VERSION);

        ConsensusNodeTest.setup(options, PRE_SIMPLE_FEES_ENTRY_VERSION);
        ConsensusNodeTest.start(options);
        DeploymentTest.info(options);
        DeploymentTest.verifyDeploymentConfigInfo(options);

        // Drives the full freeze/restart upgrade cycle to a release that unconditionally expects the
        // extra-fee entry to be present in file 0.0.113.
        ConsensusNodeTest.upgrade(options);

        describe('Post-upgrade system file staging', (): void => {
          it(`${testName}: solo should not have staged the post-upgrade system files`, async (): Promise<void> => {
            const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
            const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);

            for (const pod of pods) {
              const containerReference: Container = k8Factory
                .default()
                .containers()
                .readByRef(ContainerReference.of(PodReference.of(namespace, pod.podReference.name), ROOT_CONTAINER));

              // solo's mock upgrade zip only ever stages application.properties (see _prepareUpgradeZip in
              // src/commands/node/tasks.ts), so the node finds nothing staged for these files and skips
              // updating them, leaving them frozen at their pre-upgrade content. This assertion documents
              // that current behavior; it must flip once the upgrade path stages these files for real.
              const upgradeLog: string = await containerReference.execContainer([
                'bash',
                '-c',
                `grep -h 'No post-upgrade file for' ${HEDERA_HAPI_PATH}/output/hgcaa*.log || true`,
              ]);

              for (const stagedFileName of ['simpleFeesSchedules.json', 'feeSchedules.json', 'throttles.json']) {
                expect(upgradeLog).to.include(`No post-upgrade file for ${stagedFileName} found`);
              }
            }
          }).timeout(Duration.ofMinutes(2).toMillis());
        });

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
