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
import {spawn} from 'node:child_process';

const testName: string = 'dual-cluster-full';

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Dual Cluster Full E2E Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(2)
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
          // await k8Client.namespaces().delete(namespace);
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
      NodeTest.start(options);

      MirrorNodeTest.installPostgres(options);
      MirrorNodeTest.deployWithExternalDatabase(options);

      MirrorNodeTest.runSql(options);
      ExplorerTest.deploy(options);
      RelayTest.deploy(options);

      it('should run smoke tests', async (): Promise<void> => {
        MirrorNodeTest.executeCommand(
          `kubectl port-forward -n "${namespace.name}" svc/haproxy-node1-svc 50211:50211 &`,
          'Port Forward',
        );
        MirrorNodeTest.executeCommand(
          `kubectl port-forward -n "${namespace.name}" svc/relay-node1-hedera-json-rpc-relay 7546:7546 &`,
          'Port Forward',
        );

        const scriptPath: string = `export SOLO_HOME=${testCacheDirectory}; \
            export SOLO_CACHE_DIR=${testCacheDirectory}; \
            export SOLO_DEPLOYMENT=${testName}-deployment; \
            .github/workflows/script/solo_smoke_test.sh`;

        console.log(
          `Running smoke test script: testCacheDirectory = ${testCacheDirectory}, scriptPath = ${scriptPath}`,
        );

        return new Promise<void>((resolve, reject) => {
          const process = spawn(scriptPath, {
            stdio: 'pipe', // Use pipe to capture output
            shell: true, // Run in shell to support bash features
          });

          // Stream stdout in real-time
          process.stdout.on('data', data => {
            console.log(`${data}`.trim());
          });

          // Stream stderr in real-time
          process.stderr.on('data', data => {
            console.error(`${data}`.trim());
          });

          // Handle process completion
          process.on('close', code => {
            if (code === 0) {
              console.log('Smoke test execution succeeded');
              resolve();
            } else {
              const error = new Error(`Smoke test failed with exit code ${code}`);
              console.error(error.message);
              reject(error);
            }
          });

          // Handle process errors
          process.on('error', error => {
            console.error('Failed to start smoke test process:', error.message);
            reject(error);
          });
        });
      }).timeout(Duration.ofMinutes(15).toMillis());
    }).timeout(Duration.ofMinutes(25).toMillis());
  })
  .build();
endToEndTestSuite.runTestSuite();
