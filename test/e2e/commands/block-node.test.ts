// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';
import {Duration} from '../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import * as constants from '../../../src/core/constants.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import fs from 'node:fs';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {resetForTest} from '../../test-container.js';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {InitTest} from './tests/init-test.js';
import {ClusterReferenceTest} from './tests/cluster-reference-test.js';
import {DeploymentTest} from './tests/deployment-test.js';
import {NodeTest} from './tests/node-test.js';
import {NetworkTest} from './tests/network-test.js';
import {BlockNodeTest} from './tests/block-node-test.js';
import {sleep} from '../../../src/core/helpers.js';

const testName: string = 'block-node-test';

new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Dual Cluster Full E2E Test Suite')
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
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    describe('Block Node E2E Test', (): void => {
      const {testCacheDirectory, testLogger, namespace, contexts} = options;

      // TODO the kube config context causes issues if it isn't one of the selected clusters we are deploying to
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
        testLogger.info(`${testName}: starting ${testName} e2e test`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      beforeEach(async (): Promise<void> => {
        testLogger.info(`${testName}: resetting containers for each test`);
        resetForTest(namespace.name, testCacheDirectory, false);
        testLogger.info(`${testName}: finished resetting containers for each test`);
      });

      afterEach(async (): Promise<void> => await sleep(Duration.ofMillis(5)));

      InitTest.init(options);
      ClusterReferenceTest.connect(options);
      DeploymentTest.create(options);
      DeploymentTest.addCluster(options);
      NodeTest.keys(options);

      BlockNodeTest.add(options);

      NetworkTest.deploy(options);
      NodeTest.setup(options);
      NodeTest.start(options);

      BlockNodeTest.testBlockNode(options, 1);

      BlockNodeTest.add(options, ['node2']);

      BlockNodeTest.verifyBlockNodesJson(options, 'node1', [1], [2], {});
      BlockNodeTest.verifyBlockNodesJson(options, 'node2', [2], [], {});

      BlockNodeTest.addExternal(options, 'test-address-1', ['node1']);
      BlockNodeTest.addExternal(options, 'test-address-2:3030', ['node2']);

      // External Block Nodes
      BlockNodeTest.verifyBlockNodesJson(options, 'node1', [], [], {
        expectedExternalAddress: 'test-address-1',
        expectedExternalPort: constants.BLOCK_NODE_PORT,
      });

      BlockNodeTest.verifyBlockNodesJson(options, 'node2', [], [], {
        expectedExternalAddress: 'test-address-2',
        expectedExternalPort: 3030,
      });

      BlockNodeTest.deleteExternal(options);
      BlockNodeTest.deleteExternal(options);

      BlockNodeTest.verifyBlockNodesJson(options, 'node1', [], [], {
        unexpectedExternalAddress: 'test-address-1',
      });

      BlockNodeTest.verifyBlockNodesJson(options, 'node2', [], [], {
        unexpectedExternalAddress: 'test-address-2',
      });

      BlockNodeTest.addExternal(options, 'test-address-1', ['node1']);
      BlockNodeTest.addExternal(options, 'test-address-2:3030', ['node2']);

      // External Block Nodes
      BlockNodeTest.verifyBlockNodesJson(options, 'node1', [], [], {
        expectedExternalAddress: 'test-address-1',
        expectedExternalPort: constants.BLOCK_NODE_PORT,
      });

      BlockNodeTest.verifyBlockNodesJson(options, 'node2', [], [], {
        expectedExternalAddress: 'test-address-2',
        expectedExternalPort: 3030,
      });

      BlockNodeTest.destroy(options);

      BlockNodeTest.verifyBlockNodesJson(options, 'node1', [], [1, 2], {});

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
  })
  .build()
  .runTestSuite();
