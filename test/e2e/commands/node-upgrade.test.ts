// SPDX-License-Identifier: Apache-2.0

import {after, describe, it} from 'mocha';
import {hederaPlatformSupportsNonZeroRealms} from '../../test-utility.js';

import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Duration} from '../../../src/core/time/duration.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {InitTest} from './tests/init-test.js';
import {ClusterReferenceTest} from './tests/cluster-reference-test.js';
import {DeploymentTest} from './tests/deployment-test.js';
import {NodeTest} from './tests/node-test.js';
import {NetworkTest} from './tests/network-test.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import {AccountTest} from './tests/account-test.js';
import * as constants from '../../../src/core/constants.js';

import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type BaseTestOptions} from './tests/base-test-options.js';

const testName: string = 'node-upgrade-test';

new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Dual Cluster Full E2E Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(2)
  .withConsensusNodesCount(2)
  .withLoadBalancerEnabled(true)
  .withPinger(true)
  .withRealm(0)
  .withShard(hederaPlatformSupportsNonZeroRealms() ? 1 : 0)
  .withServiceMonitor(true)
  .withPodLog(true)
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    const {namespace, contexts} = options;

    describe('Dual Cluster Full E2E Test', (): void => {
      after(async function (): Promise<void> {
        this.timeout(Duration.ofMinutes(10).toMillis());

        await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
        await container.resolve<K8Factory>(InjectTokens.K8Factory).getK8(contexts[0]).namespaces().delete(namespace);
      });

      InitTest.init(options);
      ClusterReferenceTest.connect(options);
      DeploymentTest.create(options);
      DeploymentTest.addCluster(options);
      NodeTest.keys(options);

      NetworkTest.deploy(options);
      NodeTest.setup(options);
      NodeTest.start(options);

      AccountTest.accountCreationShouldSucceed(options);

      NodeTest.upgrade(options);

      it('Should write log metrics', async (): Promise<void> => {
        await new MetricsServerImpl().logMetrics(
          testName,
          PathEx.join(constants.SOLO_LOGS_DIR, `${testName}`),
          undefined,
          undefined,
          options.contexts,
        );
      });
    });
  })
  .build()
  .runTestSuite();
