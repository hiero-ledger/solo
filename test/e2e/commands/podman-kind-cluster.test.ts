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
import {type BaseTestOptions} from './tests/base-test-options.js';
import {PodmanKindSetupTest} from './tests/podman-kind-setup-test.js';

const testName: string = 'podman-kind-cluster';
const testTitle: string = 'Podman Installation & Kind Cluster Creation E2E Test';

/**
 * E2E Test Suite for Podman Installation and Kind Cluster Creation
 *
 * This test validates:
 * 1. Podman dependency installation (if Docker is not available)
 * 2. Kind dependency installation
 * 3. Automatic creation of a Kind cluster
 * 4. Cluster cleanup
 */
const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName(`${testTitle} Suite`)
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    describe(testTitle, (): void => {
      const {testCacheDirectory, testLogger, namespace, contexts} = options;

      before(async (): Promise<void> => {
        testLogger.info(`${testName}: starting ${testName} e2e test`);

        // Clean up test cache directory
        fs.rmSync(testCacheDirectory, {recursive: true, force: true});
        try {
          fs.rmSync(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {
            force: true,
          });
        } catch {
          // allowed to fail if the file doesn't exist
        }

        // Create test cache directory
        if (!fs.existsSync(testCacheDirectory)) {
          fs.mkdirSync(testCacheDirectory, {recursive: true});
        }

        // Reset test container
        resetForTest(namespace.name, testCacheDirectory, false);

        testLogger.info(`${testName}: test setup complete`);
      }).timeout(Duration.ofMinutes(2).toMillis());

      after(async (): Promise<void> => {
        testLogger.info(`${testName}: cleaning up test resources`);

        // Clean up namespaces
        for (const item of contexts) {
          try {
            const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
            await k8Client.namespaces().delete(namespace);
            testLogger.info(`${testName}: deleted namespace ${namespace.name} from context ${item}`);
          } catch (error) {
            testLogger.warn(`${testName}: failed to delete namespace ${namespace.name}: ${error.message}`);
          }
        }

        testLogger.info(`${testName}: finished ${testName} e2e test`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      // Test 1: Podman Installation
      PodmanKindSetupTest.testPodmanInstallation({
        ...options,
        testName,
        testLogger,
      });

      // Test 2: Kind Installation and Cluster Creation
      PodmanKindSetupTest.testKindClusterCreation({
        ...options,
        testName,
        testLogger,
      });

      // Test 3: Cluster Cleanup
      PodmanKindSetupTest.testClusterCleanup({
        ...options,
        testName,
        testLogger,
      });
    });
  })
  .build();

endToEndTestSuite.runTestSuite();
