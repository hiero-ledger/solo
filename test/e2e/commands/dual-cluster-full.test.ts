// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {resetForTest} from '../../test-container.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {InitTest} from './tests/init-test.js';
import {ClusterReferenceTest} from './tests/cluster-reference-test.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import {DeploymentTest} from './tests/deployment-test.js';
import {NodeTest} from './tests/node-test.js';
import {NetworkTest} from './tests/network-test.js';
import {MirrorNodeTest} from './tests/mirror-node-test.js';
import {ExplorerTest} from './tests/explorer-test.js';
import {RelayTest} from './tests/relay-test.js';

const testName: string = 'dual-cluster-full';

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Dual Cluster Full E2E Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(2)
  .withConsensusNodesCount(2)
  .withLoadBalancerEnabled(true)
  .withPinger(true)
  .withRealm(2)
  .withShard(3)
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    describe('Dual Cluster Full E2E Test', (): void => {
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
          const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
          await k8Client.namespaces().delete(namespace);
        }
        testLogger.info(`${testName}: starting ${testName} e2e test`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      beforeEach(async (): Promise<void> => {
        testLogger.info(`${testName}: resetting containers for each test`);
        resetForTest(namespace.name, testCacheDirectory, false);
        testLogger.info(`${testName}: finished resetting containers for each test`);
      });

      InitTest.init(options);
      ClusterReferenceTest.connect(options);
      DeploymentTest.create(options);
      DeploymentTest.addCluster(options);
      ClusterReferenceTest.setup(options);
      NodeTest.keys(options);
      NetworkTest.deploy(options);
      NodeTest.setup(options);

      NodeTest.PemKill(options);
      NodeTest.PemStop(options);

      NodeTest.start(options);

      MirrorNodeTest.add(options);

      NodeTest.add(options);
      NodeTest.update(options);
      NodeTest.destroy(options);

      ExplorerTest.add(options);
      RelayTest.add(options);

      RelayTest.destroy(options);
      ExplorerTest.destroy(options);
      MirrorNodeTest.destroy(options);
      NetworkTest.destroy(options);
    }).timeout(Duration.ofMinutes(15).toMillis());
  })
  .build();
endToEndTestSuite.runTestSuite();
